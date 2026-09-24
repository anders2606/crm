// DR-13: selve veiviser-vinduet. Ren UI-orkestrering – hva som faktisk
// skjer når brukeren fullfører (skrive datamappevalg, starte database,
// opprette administrator …) gis inn som `onSubmit`, slik at denne filen
// ikke trenger å vite noe om tjenestene i services/.
import path from 'node:path';

import { BrowserWindow, dialog, ipcMain } from 'electron';

import { getDefaultDataDir } from '../paths';
import type { WizardSubmission } from './preload';

export function runSetupWizard(onSubmit: (data: WizardSubmission) => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    let completed = false;
    const win = new BrowserWindow({
      width: 480,
      height: 620,
      resizable: false,
      title: 'Sett opp Pietra Unica CRM',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenuBarVisibility(false);
    void win.loadFile(path.join(__dirname, 'wizard.html'));

    function cleanupHandlers(): void {
      ipcMain.removeHandler('wizard:get-default-data-dir');
      ipcMain.removeHandler('wizard:choose-data-dir');
      ipcMain.removeHandler('wizard:submit');
    }

    ipcMain.handle('wizard:get-default-data-dir', () => getDefaultDataDir());

    ipcMain.handle('wizard:choose-data-dir', async () => {
      const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    });

    // Vern mot dobbel innsending (dobbeltklikk, eller et gjeninnlastet
    // vindu som ender opp med flere hendelseslyttere på samme knapp) – uten
    // denne kan to samtidige kjøringer av installer-tasks.js kappes om å
    // opprette de samme radene (roller/rettigheter) og krasje på en
    // constraint-feil i stedet for at den ene bare venter på den andre.
    let submitInFlight = false;

    ipcMain.handle('wizard:submit', async (_event, data: WizardSubmission) => {
      if (submitInFlight) {
        return { ok: false as const, error: 'Oppsettet kjører allerede – vent til det er ferdig.' };
      }
      submitInFlight = true;
      try {
        await onSubmit(data);
        cleanupHandlers();
        completed = true;
        win.close();
        resolve();
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      } finally {
        submitInFlight = false;
      }
    });

    win.on('closed', () => {
      if (completed) {
        return; // lukket programmatisk etter vellykket oppsett – ikke avslutt appen
      }
      // Brukeren lukket vinduet selv uten å fullføre – appen kan ikke starte
      // tjenester uten et gjennomført oppsett, så den avsluttes i stedet
      // for å henge i en halvferdig tilstand.
      cleanupHandlers();
      process.exit(0);
    });
  });
}
