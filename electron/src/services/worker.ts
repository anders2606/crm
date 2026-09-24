// DR-10: kjører den bunnede workeren (se scripts/build-worker.mjs) i
// Electron sin egen Node-kjøretid, samme mønster som webServer.ts.
import { utilityProcess, type UtilityProcess } from 'electron';

import { getAppServerDir, getWorkerEntry } from '../paths';
import { attachProcessLog } from './logging';

let workerProcess: UtilityProcess | null = null;

export function startWorker(env: Record<string, string>): void {
  workerProcess = utilityProcess.fork(getWorkerEntry(), [], {
    cwd: getAppServerDir(),
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
  attachProcessLog('worker', workerProcess);
}

export function stopWorker(): void {
  workerProcess?.kill();
  workerProcess = null;
}

export function isWorkerRunning(): boolean {
  return workerProcess !== null;
}

export function getWorkerProcess(): UtilityProcess | null {
  return workerProcess;
}
