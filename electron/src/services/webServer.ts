// DR-10: kjører den frittstående Next.js-serveren (next.config.mjs sin
// `output: 'standalone'`) i Electron sin egen Node-kjøretid via
// utilityProcess – Electron ER den medfølgende Node-kjøretiden (DR-02), så
// ingen separat Node-installasjon trengs.
import { utilityProcess, type UtilityProcess } from 'electron';

import { getAppServerDir, getWebServerEntry } from '../paths';
import { attachProcessLog } from './logging';

let webProcess: UtilityProcess | null = null;

export function startWebServer(env: Record<string, string>, port: number): void {
  webProcess = utilityProcess.fork(getWebServerEntry(), [], {
    cwd: getAppServerDir(),
    env: { ...process.env, ...env, PORT: String(port), HOSTNAME: '127.0.0.1' },
    stdio: 'pipe',
  });
  attachProcessLog('web', webProcess);
}

export function stopWebServer(): void {
  webProcess?.kill();
  webProcess = null;
}

export function isWebServerRunning(): boolean {
  return webProcess !== null;
}

export function getWebServerProcess(): UtilityProcess | null {
  return webProcess;
}
