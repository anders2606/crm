// DR-02/DR-10: PostgreSQL følger med appen – ingen separat installasjon.
// Binærene (initdb/postgres/pg_ctl/pg_dump/pg_restore/createdb) hentes fra
// electron/resources/postgres/bin/. De er IKKE commitet til git (over
// 100 MB, plattformspesifikke) – se electron/resources/postgres/README.md
// for nøyaktig hvor de må lastes ned fra før `npm run dist:mac` kjøres på
// en Mac. All logikk her er skrevet og kan verifiseres når binærene finnes;
// selve kjøringen er ikke testet av Claude (ingen macOS i utviklingsøkten).
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { getDatabaseDataDir, getPostgresBinDir } from '../paths';

const DATABASE_NAME = 'pietra_unica_crm';
const SUPERUSER = 'postgres';

function bin(name: string): string {
  return path.join(getPostgresBinDir(), name);
}

export function isPostgresBundled(): boolean {
  return existsSync(bin('postgres')) && existsSync(bin('initdb'));
}

export function isClusterInitialized(): boolean {
  return existsSync(path.join(getDatabaseDataDir(), 'PG_VERSION'));
}

export function initializeCluster(): void {
  mkdirSync(getDatabaseDataDir(), { recursive: true });
  const result = spawnSync(bin('initdb'), ['-D', getDatabaseDataDir(), '-U', SUPERUSER, '--auth=trust', '--encoding=UTF8'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`initdb feilet med avslutningskode ${result.status}`);
  }
}

let postgresProcess: ChildProcessWithoutNullStreams | null = null;

/** Starter (og initialiserer ved behov) den bundlede PostgreSQL-klyngen på localhost. */
export function startPostgres(port: number): Promise<void> {
  if (!isClusterInitialized()) {
    initializeCluster();
  }

  return new Promise((resolve, reject) => {
    postgresProcess = spawn(
      bin('postgres'),
      [
        '-D',
        getDatabaseDataDir(),
        '-p',
        String(port),
        '-c',
        'listen_addresses=localhost',
        // Standard unix-socket-mappen (f.eks. /var/run/postgresql) er ikke
        // nødvendigvis skrivbar for brukeren appen kjører som. Bruk en mappe
        // vi selv eier og alltid kan skrive til, i stedet for OS-standarden.
        '-c',
        `unix_socket_directories=${getDatabaseDataDir()}`,
      ],
      { stdio: 'pipe' },
    );

    let started = false;
    const onOutput = (chunk: Buffer) => {
      // PostgreSQL gir ikke noe annet signal om vellykket oppstart enn denne
      // linjen i loggen – det er den vanlige måten å oppdage det på.
      if (!started && chunk.toString().includes('ready to accept connections')) {
        started = true;
        resolve();
      }
    };
    postgresProcess.stdout.on('data', onOutput);
    postgresProcess.stderr.on('data', onOutput);
    postgresProcess.on('error', (error) => {
      if (!started) {
        reject(error);
      }
    });
    postgresProcess.on('exit', (code) => {
      postgresProcess = null;
      if (!started) {
        reject(new Error(`PostgreSQL avsluttet uventet (kode ${code}) før oppstart var ferdig`));
      }
    });
  });
}

export function stopPostgres(): Promise<void> {
  return new Promise((resolve) => {
    if (!postgresProcess) {
      resolve();
      return;
    }
    postgresProcess.once('exit', () => resolve());
    // SIGINT ("smart shutdown") venter på at pågående tilkoblinger avslutter
    // normalt, i motsetning til SIGTERM – tryggere ved vanlig stopp fra
    // kontrollpanelet.
    postgresProcess.kill('SIGINT');
  });
}

export function isPostgresRunning(): boolean {
  return postgresProcess !== null && postgresProcess.exitCode === null;
}

/** Oppretter databasen første gang – trygt å kalle på nytt (ignorerer «finnes allerede»). */
export function ensureDatabaseExists(port: number): void {
  const result = spawnSync(bin('createdb'), ['-h', 'localhost', '-p', String(port), '-U', SUPERUSER, DATABASE_NAME], {
    stdio: 'pipe',
  });
  const alreadyExists = result.stderr?.toString().includes('already exists');
  if (result.status !== 0 && !alreadyExists) {
    throw new Error(`Kunne ikke opprette databasen: ${result.stderr?.toString() ?? result.status}`);
  }
}

/** Tilkoblingsstreng for Prisma (Next.js/worker/`prisma migrate deploy`). */
export function buildDatabaseUrl(port: number): string {
  return `postgresql://${SUPERUSER}@localhost:${port}/${DATABASE_NAME}?schema=public`;
}

/**
 * Rene libpq-tilkoblingsargumenter for kommandolinjeverktøy som pg_dump/
 * pg_restore/psql – disse forstår IKKE Prisma sin `?schema=`-parameter i en
 * URL (pg_dump feiler med «invalid URI query parameter»), så de får
 * enkeltargumenter i stedet for en URL.
 */
export function getConnectionArgs(port: number): string[] {
  return ['-h', 'localhost', '-p', String(port), '-U', SUPERUSER, DATABASE_NAME];
}

/**
 * Tilkoblingsargumenter for pg_restore – ULIKT pg_dump/createdb (som tar
 * databasenavnet som et vanlig positional siste argument), forventer
 * pg_restore navnet via `-d`. Siste positional argument til pg_restore er
 * i stedet selve arkivfilen som skal gjenopprettes.
 */
export function getRestoreConnectionArgs(port: number): string[] {
  return ['-h', 'localhost', '-p', String(port), '-U', SUPERUSER, '-d', DATABASE_NAME];
}

export function getPgDumpBinary(): string {
  return bin('pg_dump');
}

export function getPgRestoreBinary(): string {
  return bin('pg_restore');
}
