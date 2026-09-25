// DR-06: liste og gjenoppretting av innebygde backuper fra
// administrasjonssiden (src/app/admin/backup/). Selve OPPRETTELSEN av
// backupene skjer i Electron (electron/src/services/backup.ts, samme
// filnavnmønster), som har tilgang til den medfølgende pg_dump-binæren –
// denne modulen kjører i web-serveren og trenger derfor bare BACKUP_DIR
// (hvor filene ligger) og DATABASE_URL. Selve gjenopprettingen er ren SQL
// (databasedumpen er tatt med `--data-only --inserts`, se
// electron/src/services/backup.ts for hvorfor), og krever derfor ikke
// pg_restore/psql-binærer fra web-serveren.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from 'pg';

function getBackupDir(): string {
  return process.env.BACKUP_DIR ?? path.join(process.cwd(), 'data', 'backups');
}

function getStorageDir(): string {
  return process.env.STORAGE_DIR ?? path.join(process.cwd(), 'data', 'documents');
}

const DB_FILE_PATTERN = /^db-([0-9A-Za-z.-]+)\.sql$/;

export interface BackupEntry {
  timestamp: string;
  dbFileName: string;
  dbSizeBytes: number;
  hasFiles: boolean;
  filesSizeBytes: number | null;
  createdAt: Date;
}

export function listBackups(): BackupEntry[] {
  const dir = getBackupDir();
  if (!existsSync(dir)) {
    return [];
  }
  const entries: BackupEntry[] = [];
  for (const fileName of readdirSync(dir)) {
    const match = DB_FILE_PATTERN.exec(fileName);
    const timestamp = match?.[1];
    if (!timestamp) {
      continue;
    }
    const dbPath = path.join(dir, fileName);
    const filesFileName = `files-${timestamp}.tar.gz`;
    const filesPath = path.join(dir, filesFileName);
    const hasFiles = existsSync(filesPath);
    entries.push({
      timestamp,
      dbFileName: fileName,
      dbSizeBytes: statSync(dbPath).size,
      hasFiles,
      filesSizeBytes: hasFiles ? statSync(filesPath).size : null,
      createdAt: statSync(dbPath).mtime,
    });
  }
  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Sikrer at et innsendt filnavn faktisk peker til en ekte fil rett inni backup-mappen (ikke ../../etc). */
function resolveBackupDbFile(dbFileName: string): string {
  if (!DB_FILE_PATTERN.test(dbFileName)) {
    throw new Error('Ugyldig backupfilnavn.');
  }
  const dir = path.resolve(getBackupDir());
  const resolved = path.resolve(dir, dbFileName);
  if (path.dirname(resolved) !== dir || !existsSync(resolved)) {
    throw new Error('Fant ikke backupfilen.');
  }
  return resolved;
}

/**
 * Fjerner psql-metakommandoer (f.eks. `\restrict`/`\unrestrict`, som nyere
 * pg_dump legger inn øverst i dumpen) – gyldige for psql, men ikke ekte SQL
 * en generisk SQL-klient (her: `pg`) kan kjøre.
 */
function stripPsqlMetaCommands(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n');
}

/**
 * Gjenoppretter databasen OG dokumentmappen fra en tidligere backup.
 * DESTRUKTIVT: all nåværende data overskrives (også aktive brukersesjoner –
 * alle logges ut). Selve databasedelen kjører i én transaksjon (TRUNCATE av
 * alle tabeller + gjeninnsetting fra dumpen), slik at en feil underveis
 * ruller tilbake til tilstanden før forsøket i stedet for å etterlate
 * databasen halvveis tømt.
 */
export async function restoreBackup(dbFileName: string): Promise<void> {
  const dbPath = resolveBackupDbFile(dbFileName);
  const match = DB_FILE_PATTERN.exec(dbFileName);
  const timestamp = match?.[1];
  if (!timestamp) {
    throw new Error('Ugyldig backupfilnavn.');
  }
  const filesPath = path.join(getBackupDir(), `files-${timestamp}.tar.gz`);
  const hasFiles = existsSync(filesPath);

  const dumpSql = stripPsqlMetaCommands(readFileSync(dbPath, 'utf8'));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL mangler.');
  }

  // Prisma sin egen $executeRawUnsafe forbereder alltid spørringen
  // (extended query protocol), som PostgreSQL nekter for flere kommandoer i
  // én streng – derfor en direkte `pg`-klient her, som bruker simple query-
  // protokollen (samme som psql) og dermed kan kjøre hele dumpen i ett kall.
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const tablesResult = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`,
    );
    if (tablesResult.rows.length > 0) {
      const tableList = tablesResult.rows.map((row) => `"${row.tablename}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }
    if (dumpSql.trim().length > 0) {
      await client.query(dumpSql);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  if (hasFiles) {
    restoreDocuments(filesPath);
  }
}

function restoreDocuments(archivePath: string): void {
  const storageDir = getStorageDir();
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pietra-unica-restore-'));
  try {
    const extractResult = spawnSync('tar', ['-xzf', archivePath, '-C', tempDir], { stdio: 'inherit' });
    if (extractResult.status !== 0) {
      throw new Error(`Kunne ikke pakke ut dokumentarkivet (avslutningskode ${extractResult.status}).`);
    }
    // Arkivet inneholder selve dokumentmappen som toppnivå-katalog (se
    // electron/src/services/backup.ts, som tar'er med -C <foreldre> <basenavn>).
    const extractedRoot = path.join(tempDir, path.basename(storageDir));
    const restoredSource = existsSync(extractedRoot) ? extractedRoot : tempDir;

    // Databasen er allerede gjenopprettet på dette tidspunktet (ikke en del
    // av samme transaksjon, siden filsystemet ikke kan rulles tilbake som en
    // SQL-transaksjon) – flytt heller enn å slette den gamle mappen direkte,
    // slik at et mislykket steg her fortsatt kan rulles tilbake manuelt.
    const previousDirBackup = existsSync(storageDir) ? `${storageDir}.for-restore-${Date.now()}` : null;
    if (previousDirBackup) {
      renameSync(storageDir, previousDirBackup);
    }
    mkdirSync(storageDir, { recursive: true });
    const copyResult = spawnSync('cp', ['-R', `${restoredSource}/.`, storageDir], { stdio: 'inherit' });
    if (copyResult.status !== 0) {
      rmSync(storageDir, { recursive: true, force: true });
      if (previousDirBackup) {
        renameSync(previousDirBackup, storageDir);
      }
      throw new Error('Kunne ikke gjenopprette dokumentene.');
    }
    if (previousDirBackup) {
      rmSync(previousDirBackup, { recursive: true, force: true });
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
