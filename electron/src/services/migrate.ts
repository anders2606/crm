// DR-03: etter automatisk backup (se backup.ts), men før web/worker startes,
// kjøres eventuelle nye databasemigreringer. Bruker den bundlede Prisma
// CLI-en (se electron/package.json "extraResources") fremfor `npx`, som
// ikke er tilgjengelig i en pakket Electron-app.
import { spawnSync } from 'node:child_process';

import { getAppServerDir, getPrismaCliEntry, getPrismaSchemaPath } from '../paths';

export function runPendingMigrations(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    [getPrismaCliEntry(), 'migrate', 'deploy', '--schema', getPrismaSchemaPath()],
    {
      cwd: getAppServerDir(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        // process.execPath ER Electron-binæren i en pakket app (det finnes
        // ingen separat Node-binærfil, jf. DR-02) – uten denne prøver
        // Electron å tolke Prisma CLI-en som et Electron-hovedscript i
        // stedet for å kjøre den som et vanlig Node-skript.
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error(`Databasemigrering feilet med avslutningskode ${result.status}`);
  }
}
