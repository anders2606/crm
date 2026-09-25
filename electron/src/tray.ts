// DR-11: kontrollpanelet i menylinjen. Rent presentasjonslag – all logikk
// (start/stopp/status/backup) bor i services/ og kalles herfra.
import path from 'node:path';

import { Menu, Tray, nativeImage, shell } from 'electron';

import { getLogsDir } from './paths';
import { isPostgresRunning } from './services/postgres';
import { isWebServerRunning } from './services/webServer';
import { isWorkerRunning } from './services/worker';

export interface TrayCallbacks {
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onBackupNow: () => Promise<void>;
  onExport: () => Promise<void>;
  getWebPort: () => number;
}

let tray: Tray | null = null;

function statusLabel(name: string, running: boolean): string {
  return `${running ? '●' : '○'} ${name}: ${running ? 'i gang' : 'stoppet'}`;
}

export function createTray(callbacks: TrayCallbacks): Tray {
  // electron/resources/trayTemplate.png er i dag en 1×1 sort plassholder
  // (ren kode uten et ekte designet ikon kan ikke lage et brukbart
  // menylinje-ikon) – bytt den ut med et ekte 16×16/22×22 malbilde
  // (sort figur, transparent bakgrunn, @2x-variant for Retina) før DMG-en
  // bygges på en Mac. Malbilde (setTemplateImage) gjør at macOS selv
  // tilpasser fargen til lyst/mørkt tema.
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'resources', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Pietra Unica CRM');
  rebuildMenu(callbacks);
  return tray;
}

export function rebuildMenu(callbacks: TrayCallbacks): void {
  if (!tray) {
    return;
  }

  const webRunning = isWebServerRunning();
  const menu = Menu.buildFromTemplate([
    { label: statusLabel('Web', webRunning), enabled: false },
    { label: statusLabel('Database', isPostgresRunning()), enabled: false },
    { label: statusLabel('Worker', isWorkerRunning()), enabled: false },
    { type: 'separator' },
    {
      label: 'Åpne i nettleser',
      enabled: webRunning,
      click: () => shell.openExternal(`http://localhost:${callbacks.getWebPort()}`),
    },
    { type: 'separator' },
    {
      label: 'Start',
      enabled: !webRunning,
      click: async () => {
        await callbacks.onStart();
        rebuildMenu(callbacks);
      },
    },
    {
      label: 'Stopp',
      enabled: webRunning,
      click: async () => {
        await callbacks.onStop();
        rebuildMenu(callbacks);
      },
    },
    { type: 'separator' },
    {
      label: 'Ta backup nå',
      click: () => callbacks.onBackupNow(),
    },
    {
      // DR-05: pakker database+dokumenter+nøkler i én fil for flytting til
      // en annen installasjon (typisk lokal modus → Mac mini).
      label: 'Eksporter for flytting …',
      enabled: webRunning,
      click: () => callbacks.onExport(),
    },
    {
      label: 'Vis logger',
      click: () => shell.openPath(getLogsDir()),
    },
    { type: 'separator' },
    { label: 'Avslutt', role: 'quit' },
  ]);

  tray.setContextMenu(menu);
}

export function updateTrayStatus(callbacks: TrayCallbacks): void {
  rebuildMenu(callbacks);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
