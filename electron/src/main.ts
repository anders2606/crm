// DR-10/DR-11: appens inngangspunkt. Orkestrerer oppstartsrekkefølgen fra
// DR-03 (backup → migrering → tjenester), første-gangs-veiviseren (DR-12/
// DR-13) og kontrollpanelet.
//
// IKKE verifisert av Claude i denne utviklingsøkten (ingen macOS
// tilgjengelig): selve Electron-kjøringen, PostgreSQL-binærene og
// launchd-integrasjonen. Se electron/README.md for hva som gjenstår å
// bekrefte på en ekte Mac.
import { app, dialog } from 'electron';

import { readConfig, writeConfig, type AppConfig } from './config';
import { runBackupNow } from './services/backup';
import { runInstallerTasks } from './services/installer';
import { acquireInstanceLock, releaseInstanceLock } from './services/instanceLock';
import { adoptMasterKey, getOrCreateMasterKey } from './services/masterKey';
import { runPendingMigrations } from './services/migrate';
import { exportInstallation, importInstallation } from './services/migration';
import { buildDatabaseUrl, ensureDatabaseExists, isPostgresBundled, startPostgres, stopPostgres } from './services/postgres';
import { startWebServer, stopWebServer, waitForWebServerReady } from './services/webServer';
import { startWorker, stopWorker } from './services/worker';
import { createTray, updateTrayStatus, type TrayCallbacks } from './tray';
import { getBackupsDir, getDocumentsDir, writeChosenDataDir } from './paths';
import { runSetupWizard } from './wizard/window';
import type { WizardSubmission } from './wizard/preload';

// Kun ett kontrollpanel-ikon om noen prøver å åpne appen på nytt.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// DR-11: kontrollpanelet trenger ikke et dock-ikon eller vinduer utenom
// veiviseren (DR-13) – det er ellers kun en menylinje-app.
app.dock?.hide();

let currentPort = 3000;
let currentPostgresPort = 55432;
let currentEncryptionKey: string | null = null;
let trayCallbacks: TrayCallbacks;
let dailyBackupTimer: ReturnType<typeof setInterval> | null = null;

// DR-06: «daglig databasedump og filer» – backup tas allerede ved hver
// oppstart (DR-03), men en servermodus-Mac mini kan stå på i ukevis uten
// restart, så det trengs i tillegg en tilbakevendende jobb mens appen
// kjører. Sjekkes hver time i stedet for å sette opp én 24-timers-timer,
// slik at en tidligere manuell «Ta backup nå» (eller en nylig oppstart)
// ikke fører til at det også tas en unødvendig ekstra en rett etterpå.
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let lastBackupAt = 0;

function scheduleDailyBackup(): void {
  lastBackupAt = Date.now();
  if (dailyBackupTimer) {
    return;
  }
  dailyBackupTimer = setInterval(() => {
    if (Date.now() - lastBackupAt < 24 * 60 * 60 * 1000) {
      return;
    }
    try {
      runBackupNow(currentPostgresPort);
      lastBackupAt = Date.now();
    } catch (error) {
      console.error('[main] Planlagt daglig backup feilet:', error);
    }
  }, BACKUP_CHECK_INTERVAL_MS);
}

function stopDailyBackupSchedule(): void {
  if (dailyBackupTimer) {
    clearInterval(dailyBackupTimer);
    dailyBackupTimer = null;
  }
}

/** DR-03: start database, ta backup, kjør migreringer. Felles for både veiviseren og vanlig oppstart. */
async function prepareDatabase(config: AppConfig): Promise<{ databaseUrl: string; encryptionKey: string }> {
  // DR-07: må skje FØR PostgreSQL startes – to samtidige PostgreSQL-
  // instanser mot de samme datafilene kan korrumpere dem.
  acquireInstanceLock();
  currentPostgresPort = config.postgresPort;

  await startPostgres(config.postgresPort);
  ensureDatabaseExists(config.postgresPort);
  const databaseUrl = buildDatabaseUrl(config.postgresPort);

  try {
    runBackupNow(config.postgresPort);
  } catch (error) {
    console.error('[main] Backup ved oppstart feilet, fortsetter likevel:', error);
  }
  runPendingMigrations(databaseUrl);

  // DR-08: masternøkkelen som beskytter PowerOffice-/e-postkonto-
  // hemmelighetene i databasen hentes fra macOS-nøkkelringen, ikke .env.
  const encryptionKey = await getOrCreateMasterKey();

  return { databaseUrl, encryptionKey };
}

/**
 * Starter web-serveren og workeren, og venter til web-serveren faktisk
 * svarer på helsesjekken før den returnerer – se waitForWebServerReady sin
 * kommentar for hvorfor dette er nødvendig før veiviseren lukker vinduet
 * sitt.
 */
async function startAppServices(databaseUrl: string, encryptionKey: string, port: number): Promise<void> {
  // DO-08: uten STORAGE_DIR lagrer web-serveren dokumenter relativt til sin
  // egen cwd (inni selve app-bunten) i stedet for i datamappen – som ville
  // blitt slettet ved neste oppdatering (DR-14) og ikke tatt med i
  // eksport/import (DR-05) eller backup (DR-06).
  const sharedEnv = {
    DATABASE_URL: databaseUrl,
    ENCRYPTION_KEY: encryptionKey,
    STORAGE_DIR: getDocumentsDir(),
    // DR-06: gjenopprettingssiden i admin (src/lib/backup.ts) må vite hvor
    // backupene ligger for å kunne liste og gjenopprette fra dem.
    BACKUP_DIR: getBackupsDir(),
    NODE_ENV: 'production',
  };
  startWebServer(sharedEnv, port);
  startWorker(sharedEnv);
  await waitForWebServerReady(port);
  currentEncryptionKey = encryptionKey;
  scheduleDailyBackup();
}

/**
 * DR-05: importgrenen av førstegangsoppsettet – gjenoppretter database,
 * dokumenter og masternøkkel fra en eksportfil laget av `exportInstallation`
 * på en ANNEN installasjon, i stedet for å opprette en helt ny administrator.
 * Databasen må migreres til et tomt skjema FØR importen kjøres (samme
 * migreringer som alltid kjører ved oppstart, se `prepareDatabase`), men
 * uten den vanlige `getOrCreateMasterKey()` (som ville generert en FERSK
 * nøkkel her, ikke den importerte som de innkommende hemmelighetene faktisk
 * er kryptert med) eller en oppstartsbackup (databasen er jo fortsatt tom).
 */
async function completeImport(config: AppConfig, archivePath: string): Promise<{ databaseUrl: string; encryptionKey: string }> {
  acquireInstanceLock();
  currentPostgresPort = config.postgresPort;
  await startPostgres(config.postgresPort);
  ensureDatabaseExists(config.postgresPort);
  const databaseUrl = buildDatabaseUrl(config.postgresPort);
  runPendingMigrations(databaseUrl);

  const { encryptionKey } = importInstallation(archivePath, config.postgresPort);
  await adoptMasterKey(encryptionKey);

  return { databaseUrl, encryptionKey };
}

/** DR-13: kjøres kun ved førstegangsoppsett – etter dette er setupComplete satt. */
async function completeSetup(data: WizardSubmission): Promise<void> {
  writeChosenDataDir(data.dataDir);

  if (!isPostgresBundled()) {
    throw new Error('De medfølgende PostgreSQL-binærene ble ikke funnet. Kontakt support.');
  }

  const config = await readConfig();

  const { databaseUrl, encryptionKey } = data.importArchivePath
    ? await completeImport(config, data.importArchivePath)
    : await prepareDatabase(config);

  if (!data.importArchivePath) {
    if (!data.admin) {
      throw new Error('Administratoropplysninger mangler.');
    }
    runInstallerTasks(data.admin, data.poweroffice, { DATABASE_URL: databaseUrl, ENCRYPTION_KEY: encryptionKey });
  }

  currentPort = config.webPort;
  await startAppServices(databaseUrl, encryptionKey, currentPort);

  await writeConfig({ ...config, mode: data.mode, setupComplete: true, lastKnownVersion: app.getVersion() });
}

/** Vanlig oppstart etter at veiviseren allerede er gjennomført. */
async function startServices(): Promise<void> {
  const config = await readConfig();
  currentPort = config.webPort;

  if (!isPostgresBundled()) {
    dialog.showErrorBox(
      'PostgreSQL mangler',
      'De medfølgende PostgreSQL-binærene ble ikke funnet. Dette skal ikke skje i en ferdig installert app – kontakt support.',
    );
    return;
  }

  try {
    const { databaseUrl, encryptionKey } = await prepareDatabase(config);
    await startAppServices(databaseUrl, encryptionKey, currentPort);
  } catch (error) {
    dialog.showErrorBox('Kunne ikke starte', error instanceof Error ? error.message : String(error));
    return;
  }

  await writeConfig({ ...config, lastKnownVersion: app.getVersion() });
}

async function stopServices(): Promise<void> {
  stopDailyBackupSchedule();
  stopWorker();
  stopWebServer();
  await stopPostgres();
  releaseInstanceLock();
}

app.whenReady().then(async () => {
  trayCallbacks = {
    onStart: startServices,
    onStop: stopServices,
    onBackupNow: async () => {
      const config = await readConfig();
      runBackupNow(config.postgresPort);
    },
    onExport: async () => {
      // DR-05: eksporterer denne installasjonen for flytting til en annen
      // (typisk lokal modus → Mac mini). Trenger både postgres og
      // masternøkkelen å eksportere med, altså at tjenestene faktisk kjører.
      if (!currentEncryptionKey) {
        dialog.showErrorBox('Kan ikke eksportere', 'Tjenestene må kjøre (se «Start» i menyen) før eksport.');
        return;
      }
      const result = await dialog.showSaveDialog({
        title: 'Eksporter Pietra Unica CRM',
        defaultPath: `pietra-unica-eksport-${new Date().toISOString().slice(0, 10)}.tar.gz`,
        filters: [{ name: 'Pietra Unica-eksport', extensions: ['tar.gz'] }],
      });
      if (result.canceled || !result.filePath) {
        return;
      }
      try {
        exportInstallation(currentPostgresPort, currentEncryptionKey, result.filePath);
        dialog.showMessageBox({ type: 'info', message: 'Eksport fullført', detail: result.filePath });
      } catch (error) {
        dialog.showErrorBox('Eksport feilet', error instanceof Error ? error.message : String(error));
      }
    },
    getWebPort: () => currentPort,
  };

  createTray(trayCallbacks);

  const config = await readConfig();
  if (!config.setupComplete) {
    // DR-12/DR-13: modus, datamappe, administrator og nøkler velges her
    // første gang – deretter starter tjenestene automatisk som normalt.
    await runSetupWizard(completeSetup);
  } else {
    await startServices();
  }

  updateTrayStatus(trayCallbacks);
});

let isQuitting = false;
app.on('before-quit', async (event) => {
  if (isQuitting) {
    return;
  }
  event.preventDefault();
  isQuitting = true;
  await stopServices();
  app.quit();
});

// Uten denne blir Electron sin STANDARDOPPFØRSEL brukt når siste vindu
// lukkes: på Linux/Windows er standarden å avslutte HELE appen (kun macOS
// unntar dette som standard). Dette er en ren menylinje-app (DR-11) som
// skal fortsette å kjøre i bakgrunnen etter at veiviseren (DR-13, det
// eneste vinduet appen noen gang åpner) lukkes – kun «Avslutt» i
// menylinjen (se tray.ts) skal faktisk avslutte appen. Ble oppdaget som en
// reell feil under utvikling: uten dette avsluttet HELE appen (og dermed
// web-serveren/workeren) i det øyeblikket veiviseren fullførte, siden
// vinduet lukkes programmatisk med det samme.
app.on('window-all-closed', () => {
  // Bevisst tom – ingen app.quit() her.
});
