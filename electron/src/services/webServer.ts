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

/**
 * Venter til web-serveren faktisk svarer på helsesjekken. Installasjons-
 * veiviseren (DR-13) bør vente på dette før den melder oppsettet fullført
 * og lukker vinduet sitt, slik at en reell oppstartsfeil (f.eks. en
 * DATABASE_URL som ikke virker) vises til brukeren i veiviseren i stedet
 * for at oppsettet stille markeres som ferdig mens serveren aldri kom opp.
 */
export async function waitForWebServerReady(port: number, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Serveren er ikke oppe ennå – prøv igjen.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Web-serveren svarte ikke på helsesjekken i tide.');
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
