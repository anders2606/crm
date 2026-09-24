// DR-02/DR-13: appens datamappe er alt lokal modus/servermodus trenger å
// vite om for å finne igjen database, dokumenter, logger og innstillinger
// mellom oppstarter. Standardplassering følger macOS-konvensjon
// (~/Library/Application Support/<appnavn>); PIETRA_UNICA_DATA_DIR lar
// installasjonsveiviseren (DR-13) og utvikling/test overstyre den.
import path from 'node:path';

import { app } from 'electron';

export function getDefaultDataDir(): string {
  return path.join(app.getPath('appData'), 'Pietra Unica CRM');
}

export function getDataDir(): string {
  return process.env.PIETRA_UNICA_DATA_DIR ?? getDefaultDataDir();
}

/**
 * I en pakket app er dette Contents/Resources, der electron-builder sin
 * `extraResources` (se package.json "build") legger igjen den frittstående
 * Next.js-serveren, den bundlede workeren og PostgreSQL-binærene. I
 * utvikling (`electron .`) peker den på Electron sin egen ressursmappe, som
 * ikke inneholder disse – bruk PIETRA_UNICA_RESOURCES_DIR til å peke på et
 * midlertidig oppsett da (se electron/README.md).
 */
export function getResourcesPath(): string {
  return process.env.PIETRA_UNICA_RESOURCES_DIR ?? process.resourcesPath;
}

export function getPostgresBinDir(): string {
  return path.join(getResourcesPath(), 'postgres', 'bin');
}

export function getAppServerDir(): string {
  return path.join(getResourcesPath(), 'app');
}

export function getWebServerEntry(): string {
  return path.join(getAppServerDir(), 'server.js');
}

export function getWorkerEntry(): string {
  return path.join(getAppServerDir(), 'dist-worker', 'worker.js');
}

export function getPrismaCliEntry(): string {
  return path.join(getAppServerDir(), 'node_modules', 'prisma', 'build', 'index.js');
}

export function getPrismaSchemaPath(): string {
  return path.join(getAppServerDir(), 'prisma', 'schema.prisma');
}

export function getDatabaseDataDir(): string {
  return path.join(getDataDir(), 'postgres-data');
}

export function getDocumentsDir(): string {
  return path.join(getDataDir(), 'documents');
}

export function getLogsDir(): string {
  return path.join(getDataDir(), 'logs');
}

export function getBackupsDir(): string {
  return path.join(getDataDir(), 'backups');
}

export function getConfigFilePath(): string {
  return path.join(getDataDir(), 'config.json');
}

export function getLockFilePath(): string {
  return path.join(getDataDir(), '.lock');
}
