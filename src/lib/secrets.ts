// M3: kryptering av PowerOffice-nøkler og e-postkontopassord i databasen
// (AES-256-GCM via Node sin innebygde crypto, ingen ny avhengighet).
// ENCRYPTION_KEY kommer fra `.env` i utvikling (arbeidsregel 6), og fra
// macOS-nøkkelringen i lokal modus/servermodus (DR-08, M9 –
// electron/src/services/masterKey.ts genererer/henter den og gir den videre
// som miljøvariabel til web-serveren og workeren). Denne modulen trenger
// derfor ikke vite hvilken modus den kjører i.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // anbefalt IV-lengde for GCM

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('ENCRYPTION_KEY mangler i miljøvariabler (.env)');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY må være 32 byte (64 hex-tegn)');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ['v1', iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Ugyldig kryptert verdi');
  }
  const [, ivHex, authTagHex, ciphertextHex] = parts as [string, string, string, string];
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
