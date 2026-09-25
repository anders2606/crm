// DR-03: etter automatisk backup (se backup.ts), men før web/worker startes,
// kjøres eventuelle nye databasemigreringer. Bruker den bundlede Prisma
// CLI-en (se electron/package.json "extraResources") fremfor `npx`, som
// ikke er tilgjengelig i en pakket Electron-app.
import { getAppServerDir, getPrismaCliEntry, getPrismaSchemaPath } from '../paths';
import { runOrThrow } from './processUtils';

export function runPendingMigrations(databaseUrl: string): void {
  runOrThrow(process.execPath, [getPrismaCliEntry(), 'migrate', 'deploy', '--schema', getPrismaSchemaPath()], 'Databasemigrering', {
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
  });
}
