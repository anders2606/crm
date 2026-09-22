// DR-03/DR-06: tar en databasedump OG et arkiv av dokumentmappen ved
// oppstart, og roterer bort begge deler etter oppbevaringstiden. Full
// rotasjon til ekstern/kryptert disk og medfølgende binærer (pg_dump/tar)
// kommer med serverpakken i M9 – dette skriptet krever dem i PATH i
// utvikling.
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

// I motsetning til Prisma Client (som laster .env selv når det trengs), gjør
// ikke dette frittstående skriptet det automatisk. Uten denne linjen finner
// prosessen aldri DATABASE_URL og hopper stille over backup (arbeidsregel 6).
try {
  process.loadEnvFile();
} catch {
  // Ingen .env til stede (f.eks. servermodus i M9, der miljøet settes opp
  // på annet vis) – da må variablene allerede være satt i prosessmiljøet.
}

const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'data', 'backups');
const STORAGE_DIR = process.env.STORAGE_DIR ?? path.join(process.cwd(), 'data', 'documents');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('[backup] DATABASE_URL er ikke satt – hopper over backup.');
    return;
  }

  await mkdir(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbFilePath = path.join(BACKUP_DIR, `db-${timestamp}.sql`);
  const filesArchivePath = path.join(BACKUP_DIR, `files-${timestamp}.tar.gz`);

  await runPgDump(databaseUrl, dbFilePath);
  await archiveDocuments(filesArchivePath);
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

async function archiveDocuments(archivePath: string): Promise<void> {
  try {
    await stat(STORAGE_DIR);
  } catch {
    console.log('[backup] Ingen dokumentmappe funnet ennå – hopper over filbackup.');
    return;
  }

  return new Promise((resolve) => {
    const child = spawn(
      'tar',
      ['-czf', archivePath, '-C', path.dirname(STORAGE_DIR), path.basename(STORAGE_DIR)],
      { stdio: 'inherit' },
    );
    child.on('error', (error) => {
      console.warn(`[backup] Kunne ikke kjøre tar (${error.message}). Hopper over filbackup.`);
      resolve();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`[backup] Dokumentarkiv lagret: ${archivePath}`);
      } else {
        console.warn(`[backup] tar avsluttet med kode ${code}. Hopper over filbackup.`);
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
      .filter(
        (file) =>
          (file.startsWith('db-') && file.endsWith('.sql')) ||
          (file.startsWith('files-') && file.endsWith('.tar.gz')),
      )
      .map(async (file) => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await rm(filePath);
          console.log(`[backup] Fjernet gammel backup: ${file}`);
        }
      }),
  );
}

main().catch((error) => {
  console.error('[backup] Uventet feil:', error);
  process.exitCode = 1;
});
