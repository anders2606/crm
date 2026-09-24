// DR-10/DR-11: appens inngangspunkt. Orkestrerer oppstartsrekkefølgen fra
// DR-03 (backup → migrering → tjenester) og styrer kontrollpanelet.
//
// IKKE verifisert av Claude i denne utviklingsøkten (ingen macOS
// tilgjengelig): selve Electron-kjøringen, PostgreSQL-binærene og
// launchd-integrasjonen. Se electron/README.md for hva som gjenstår å
// bekrefte på en ekte Mac.
import { app, dialog } from 'electron';

import { readConfig, writeConfig } from './config';
import { runBackupNow } from './services/backup';
import { runPendingMigrations } from './services/migrate';
import { buildDatabaseUrl, ensureDatabaseExists, isPostgresBundled, startPostgres, stopPostgres } from './services/postgres';
import { startWebServer, stopWebServer } from './services/webServer';
import { startWorker, stopWorker } from './services/worker';
import { createTray, updateTrayStatus, type TrayCallbacks } from './tray';

// Kun ett kontrollpanel-ikon om noen prøver å åpne appen på nytt.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// DR-11: kontrollpanelet trenger ikke et dock-ikon eller vinduer – det er
// kun en menylinje-app.
app.dock?.hide();

let currentPort = 3000;
let trayCallbacks: TrayCallbacks;

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

  await startPostgres(config.postgresPort);
  ensureDatabaseExists(config.postgresPort);
  const databaseUrl = buildDatabaseUrl(config.postgresPort);

  // DR-03: automatisk backup, deretter migreringer, i den rekkefølgen.
  try {
    runBackupNow(config.postgresPort);
  } catch (error) {
    console.error('[main] Backup ved oppstart feilet, fortsetter likevel:', error);
  }
  runPendingMigrations(databaseUrl);

  const sharedEnv = { DATABASE_URL: databaseUrl, NODE_ENV: 'production' };
  startWebServer(sharedEnv, currentPort);
  startWorker(sharedEnv);

  await writeConfig({ ...config, lastKnownVersion: app.getVersion() });
}

async function stopServices(): Promise<void> {
  stopWorker();
  stopWebServer();
  await stopPostgres();
}

app.whenReady().then(async () => {
  trayCallbacks = {
    onStart: startServices,
    onStop: stopServices,
    onBackupNow: async () => {
      const config = await readConfig();
      runBackupNow(config.postgresPort);
    },
    getWebPort: () => currentPort,
  };

  createTray(trayCallbacks);
  await startServices();
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

// Menylinje-appen åpner aldri et BrowserWindow, så «alle vinduer lukket»
// slår aldri inn i praksis – ingen egen håndtering trengs (og på macOS
// avslutter Electron uansett ikke appen automatisk ved dette, som er
// riktig oppførsel for en menylinje-app).
