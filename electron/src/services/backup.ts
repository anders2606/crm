// DR-03/DR-06: tar en databasedump og et arkiv av dokumentmappen. Kalles
// ved oppstart (før migreringer, se main.ts) og fra kontrollpanelets
// «ta backup nå»-knapp. Rotasjon til ekstern/kryptert disk og gjenoppretting
// utvides i en senere M9-oppgave (DR-06) – dette er minimumsversjonen som
// dekker DR-03s oppstartsrekkefølge.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { getBackupsDir, getDocumentsDir } from '../paths';
import { getConnectionArgs, getPgDumpBinary } from './postgres';

const RETENTION_DAYS = 30;

export function runBackupNow(port: number): void {
  mkdirSync(getBackupsDir(), { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbFilePath = path.join(getBackupsDir(), `db-${timestamp}.sql`);
  const filesArchivePath = path.join(getBackupsDir(), `files-${timestamp}.tar.gz`);

  const dumpResult = spawnSync(
    getPgDumpBinary(),
    ['--format=plain', '--file', dbFilePath, ...getConnectionArgs(port)],
    { stdio: 'inherit' },
  );
  if (dumpResult.status !== 0) {
    throw new Error(`pg_dump feilet med avslutningskode ${dumpResult.status}`);
  }

  if (existsSync(getDocumentsDir())) {
    const tarResult = spawnSync(
      'tar',
      ['-czf', filesArchivePath, '-C', path.dirname(getDocumentsDir()), path.basename(getDocumentsDir())],
      { stdio: 'inherit' },
    );
    if (tarResult.status !== 0) {
      throw new Error(`tar feilet med avslutningskode ${tarResult.status}`);
    }
  }

  rotateOldBackups();
}

function rotateOldBackups(): void {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const fileName of readdirSync(getBackupsDir())) {
    const filePath = path.join(getBackupsDir(), fileName);
    if (statSync(filePath).mtimeMs < cutoff) {
      unlinkSync(filePath);
    }
  }
}
