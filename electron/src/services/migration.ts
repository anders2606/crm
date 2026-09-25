// DR-05: full eksport (database + dokumenter + masternøkkel) til ÉN fil, og
// import med kontroll av at alt er med – for å flytte en installasjon fra
// lokal modus til Mac mini (eller omvendt).
//
// Databasen eksporteres KUN med data (`--data-only`), ikke skjema: skjemaet
// opprettes uansett alltid på nytt av Prisma-migreringene når appen starter
// (se main.ts), så å flytte bare dataene unngår versjonskrøll mellom
// skjemaet i en gammel eksportfil og migreringene på målmaskinen.
//
// Masternøkkelen (DR-08) må også følge med: PowerOffice-/e-postkonto-
// hemmelighetene i databasen er kryptert med KILDENS nøkkel (macOS-
// nøkkelringen), og ville vært umulig å dekryptere igjen med en fersk,
// tilfeldig generert nøkkel på målmaskinen.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getDocumentsDir } from '../paths';
import { getPgDumpBinary, getPgRestoreBinary, getConnectionArgs, getRestoreConnectionArgs } from './postgres';
import { runOrThrow } from './processUtils';

interface ExportManifest {
  version: 1;
  exportedAt: string;
  documentCount: number;
  databaseDumpSha256: string;
}

const MANIFEST_FILE = 'manifest.json';
const DB_DUMP_FILE = 'database.dump';
const KEY_FILE = 'master-key.txt';
const DOCUMENTS_DIR_NAME = 'documents';

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function countFilesRecursive(dir: string): number {
  if (!existsSync(dir)) {
    return 0;
  }
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    count += entry.isDirectory() ? countFilesRecursive(full) : 1;
  }
  return count;
}

/**
 * Kopierer INNHOLDET i `source` inn i `dest` (som må finnes fra før), ikke
 * selve `source`-mappen. `cp -R` trenger kildeargumentet til å slutte på en
 * bokstavelig `/.` for dette – path.join(source, '.') virker IKKE her, siden
 * path.join normaliserer bort den avsluttende `.`, og `cp -R` da i stedet
 * kopierer selve mappen inn i en allerede eksisterende dest (dobbel nesting).
 */
function copyDirContents(source: string, dest: string): void {
  runOrThrow('cp', ['-R', `${source}/.`, dest], 'Kopiering av dokumenter');
}

/** Eksporterer denne installasjonens database, dokumenter og masternøkkel til ÉN fil på `destinationPath`. */
export function exportInstallation(port: number, encryptionKey: string, destinationPath: string): void {
  const workDir = mkdtempSync(path.join(tmpdir(), 'pietra-unica-export-'));
  try {
    const dbDumpPath = path.join(workDir, DB_DUMP_FILE);
    runOrThrow(
      getPgDumpBinary(),
      ['--data-only', '--format=custom', '--file', dbDumpPath, ...getConnectionArgs(port)],
      'pg_dump',
    );

    const documentsSource = getDocumentsDir();
    const documentsDest = path.join(workDir, DOCUMENTS_DIR_NAME);
    mkdirSync(documentsDest, { recursive: true });
    if (existsSync(documentsSource)) {
      copyDirContents(documentsSource, documentsDest);
    }

    writeFileSync(path.join(workDir, KEY_FILE), encryptionKey, 'utf8');

    const manifest: ExportManifest = {
      version: 1,
      exportedAt: new Date().toISOString(),
      documentCount: countFilesRecursive(documentsDest),
      databaseDumpSha256: sha256File(dbDumpPath),
    };
    writeFileSync(path.join(workDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8');

    mkdirSync(path.dirname(destinationPath), { recursive: true });
    runOrThrow(
      'tar',
      ['-czf', destinationPath, '-C', workDir, MANIFEST_FILE, DB_DUMP_FILE, KEY_FILE, DOCUMENTS_DIR_NAME],
      'tar',
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export interface ImportResult {
  encryptionKey: string;
}

/**
 * Importerer en eksportfil laget av `exportInstallation`. Databasen MÅ
 * allerede være migrert til et tomt skjema før dette kalles (se main.ts).
 * Kontrollerer at arkivet er komplett (sjekksum på dumpen, riktig antall
 * dokumenter) før noe skrives til den ekte databasen/datamappen.
 */
export function importInstallation(archivePath: string, port: number): ImportResult {
  if (!existsSync(archivePath)) {
    throw new Error(`Fant ikke eksportfilen: ${archivePath}`);
  }

  const workDir = mkdtempSync(path.join(tmpdir(), 'pietra-unica-import-'));
  try {
    runOrThrow('tar', ['-xzf', archivePath, '-C', workDir], 'Utpakking av eksportfilen');

    const manifestPath = path.join(workDir, MANIFEST_FILE);
    if (!existsSync(manifestPath)) {
      throw new Error('Eksportfilen mangler manifest.json – er dette en gyldig eksportfil?');
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExportManifest;

    const dbDumpPath = path.join(workDir, DB_DUMP_FILE);
    if (!existsSync(dbDumpPath)) {
      throw new Error('Eksportfilen mangler databasedumpen.');
    }
    if (sha256File(dbDumpPath) !== manifest.databaseDumpSha256) {
      throw new Error('Databasedumpen i eksportfilen er skadet (sjekksum stemmer ikke) – import avbrutt.');
    }

    const documentsSource = path.join(workDir, DOCUMENTS_DIR_NAME);
    const actualDocumentCount = countFilesRecursive(documentsSource);
    if (actualDocumentCount !== manifest.documentCount) {
      throw new Error(
        `Eksportfilen ser ufullstendig ut: forventet ${manifest.documentCount} dokumenter, fant ${actualDocumentCount} – import avbrutt.`,
      );
    }

    const keyPath = path.join(workDir, KEY_FILE);
    if (!existsSync(keyPath)) {
      throw new Error('Eksportfilen mangler krypteringsnøkkelen – import avbrutt.');
    }
    const encryptionKey = readFileSync(keyPath, 'utf8').trim();

    // Data-only-restore mot et allerede migrert (tomt) skjema. --disable-
    // triggers unngår at fremmednøkkel-constraints feiler pga.
    // innsettingsrekkefølge – trygt siden vi kjører som databaseeieren.
    // --single-transaction gjør at et eventuelt avbrudd ikke etterlater
    // databasen halvveis importert.
    runOrThrow(
      getPgRestoreBinary(),
      ['--data-only', '--disable-triggers', '--single-transaction', ...getRestoreConnectionArgs(port), dbDumpPath],
      'pg_restore',
    );

    const documentsDest = getDocumentsDir();
    mkdirSync(documentsDest, { recursive: true });
    if (actualDocumentCount > 0) {
      copyDirContents(documentsSource, documentsDest);
    }

    return { encryptionKey };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
