// DR-13: kjører den bundlede installer-tasks.js (opprett administrator,
// lagre PowerOffice-nøkler) fra veiviseren. Samme ELECTRON_RUN_AS_NODE-
// mønster som migrate.ts, siden process.execPath er Electron-binæren i en
// pakket app.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getAppServerDir, getInstallerTasksEntry } from '../paths';

export interface InstallerAdminInput {
  name: string;
  email: string;
  password: string;
}

export interface InstallerPowerOfficeInput {
  environment: 'DEMO' | 'PRODUCTION';
  applicationKey?: string;
  clientKey?: string;
  subscriptionKey?: string;
  invoiceReceiptEmail?: string;
}

export function runInstallerTasks(
  admin: InstallerAdminInput,
  poweroffice: InstallerPowerOfficeInput | undefined,
  env: { DATABASE_URL: string; ENCRYPTION_KEY: string },
): void {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'pietra-unica-installer-'));
  const inputPath = path.join(tmpDir, 'input.json');
  try {
    writeFileSync(inputPath, JSON.stringify({ admin, poweroffice }), 'utf8');

    const result = spawnSync(process.execPath, [getInstallerTasksEntry(), inputPath], {
      cwd: getAppServerDir(),
      env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      throw new Error(`Kunne ikke fullføre oppsettet (avslutningskode ${result.status})`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
