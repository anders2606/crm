// DR-03/DR-06 (forenklet for M0): tar en databasedump ved oppstart og
// rotererer bort dumper eldre enn oppbevaringstiden. Full 30-dagers
// rotasjon til ekstern disk/kryptert kopi og medfølgende Postgres-binærer
// kommer med serverpakken i M9 – dette skriptet krever `pg_dump` i PATH.
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'data', 'backups');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('[backup] DATABASE_URL er ikke satt – hopper over backup.');
    return;
  }

  await mkdir(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(BACKUP_DIR, `db-${timestamp}.sql`);

  await runPgDump(databaseUrl, filePath);
  await rotateOldBackups();
}

function runPgDump(databaseUrl: string, filePath: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('pg_dump', ['--format=plain', '--file', filePath, databaseUrl], {
      stdio: 'inherit',
    });
    child.on('error', (error) => {
      console.warn(`[backup] Kunne ikke kjøre pg_dump (${error.message}). Hopper over backup.`);
      resolve();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`[backup] Databasedump lagret: ${filePath}`);
      } else {
        console.warn(`[backup] pg_dump avsluttet med kode ${code}. Hopper over backup.`);
      }
      resolve();
    });
  });
}

async function rotateOldBackups(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let files: string[];
  try {
    files = await readdir(BACKUP_DIR);
  } catch {
    return;
  }

  await Promise.all(
    files
      .filter((file) => file.startsWith('db-') && file.endsWith('.sql'))
      .map(async (file) => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await rm(filePath);
          console.log(`[backup] Fjernet gammel dump: ${file}`);
        }
      }),
  );
}

main().catch((error) => {
  console.error('[backup] Uventet feil:', error);
  process.exitCode = 1;
});
