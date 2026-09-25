// DR-08: nøkler og passord (PowerOffice, e-postkontoer) skal ligge i
// macOS-nøkkelringen, ikke i klartekst. Selve verdiene er allerede
// AES-256-GCM-kryptert i databasen (src/lib/secrets.ts, bygget i M3) – det
// som har manglet er hvor MASTERNØKKELEN som beskytter dem oppbevares. I
// utvikling ligger den i `.env` (arbeidsregel 6); i lokal modus/servermodus
// genereres og hentes den herfra via macOS sin nøkkelring (Electron sin
// `safeStorage`, som er et tynt lag over Keychain på macOS).
//
// safeStorage krypterer/dekrypterer kun – den bestemmer ikke selv hvor den
// krypterte bytes-blobben lagres, så vi skriver den til en egen fil i
// datamappen (kun lesbar av samme OS-bruker/maskin, siden Keychain-nøkkelen
// den er kryptert med er bundet til akkurat den kombinasjonen).
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { safeStorage } from 'electron';

import { getDataDir } from '../paths';

const KEY_LENGTH_BYTES = 32; // src/lib/secrets.ts krever 32 byte (64 hex-tegn)

function getMasterKeyFilePath(): string {
  return path.join(getDataDir(), 'master-key.enc');
}

function generateHexKey(): string {
  return randomBytes(KEY_LENGTH_BYTES).toString('hex');
}

/**
 * Henter (eller genererer, ved første oppstart) ENCRYPTION_KEY-verdien
 * `src/lib/secrets.ts` forventer, beskyttet av macOS sin nøkkelring.
 *
 * Faller tilbake til en ukryptert fil KUN når `safeStorage` ikke er
 * tilgjengelig (f.eks. Linux uten en secret service konfigurert, som i
 * utviklings-/testmiljøet denne koden er skrevet i) – ikke en reell
 * situasjon på en ferdig satt opp Mac, der Keychain alltid finnes.
 */
export async function getOrCreateMasterKey(): Promise<string> {
  const filePath = getMasterKeyFilePath();
  const keychainAvailable = safeStorage.isEncryptionAvailable();

  const existing = await readExistingKey(filePath, keychainAvailable);
  if (existing) {
    return existing;
  }

  const hexKey = generateHexKey();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const toWrite = keychainAvailable ? safeStorage.encryptString(hexKey) : Buffer.from(hexKey, 'utf8');
  await fs.writeFile(filePath, toWrite);
  return hexKey;
}

/**
 * DR-05: erstatter masternøkkelen med en importert verdi (fra en eksport
 * tatt på en annen installasjon), slik at hemmelighetene (PowerOffice-/
 * e-postkonto-nøkler) som fulgte med i den importerte databasen fortsatt
 * kan dekrypteres på denne maskinen – de ble kryptert med KILDENS nøkkel,
 * ikke en fersk nøkkel denne installasjonen ellers ville generert selv.
 */
export async function adoptMasterKey(hexKey: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
    throw new Error('Krypteringsnøkkelen i eksportfilen har feil format.');
  }
  const filePath = getMasterKeyFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const keychainAvailable = safeStorage.isEncryptionAvailable();
  const toWrite = keychainAvailable ? safeStorage.encryptString(hexKey) : Buffer.from(hexKey, 'utf8');
  await fs.writeFile(filePath, toWrite);
}

async function readExistingKey(filePath: string, keychainAvailable: boolean): Promise<string | null> {
  let stored: Buffer;
  try {
    stored = await fs.readFile(filePath);
  } catch {
    return null;
  }

  if (!keychainAvailable) {
    console.warn(
      '[masterKey] macOS-nøkkelringen er ikke tilgjengelig – bruker en ukryptert nøkkelfil. ' +
        'Dette skal ALDRI skje på en ferdig satt opp Mac (kun i utvikling/test uten Keychain).',
    );
    return stored.toString('utf8');
  }

  return safeStorage.decryptString(stored);
}
