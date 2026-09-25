// DR-13: eneste bro mellom veiviser-siden (usikret renderer-kontekst) og
// Electron sin hovedprosess. Eksponerer et minimalt, navngitt API i stedet
// for å slå på nodeIntegration – standard sikkerhetsmønster for Electron.
import { contextBridge, ipcRenderer } from 'electron';

export interface WizardSubmission {
  mode: 'local' | 'server';
  dataDir: string;
  // DR-05: hvis satt, importeres database/dokumenter/nøkkel fra denne
  // eksportfilen i stedet for å opprette en helt ny installasjon – da er
  // `admin`/`poweroffice` tomme, siden de allerede følger med i importen.
  importArchivePath?: string;
  admin?: { name: string; email: string; password: string };
  poweroffice?: {
    environment: 'DEMO' | 'PRODUCTION';
    applicationKey?: string;
    clientKey?: string;
    subscriptionKey?: string;
    invoiceReceiptEmail?: string;
  };
}

contextBridge.exposeInMainWorld('wizardAPI', {
  getDefaultDataDir: (): Promise<string> => ipcRenderer.invoke('wizard:get-default-data-dir'),
  chooseDataDir: (): Promise<string | null> => ipcRenderer.invoke('wizard:choose-data-dir'),
  chooseImportFile: (): Promise<string | null> => ipcRenderer.invoke('wizard:choose-import-file'),
  submit: (data: WizardSubmission): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('wizard:submit', data),
});
