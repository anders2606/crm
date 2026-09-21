// Tidsbasert engangspassord (TOTP) etter RFC 6238 / HOTP etter RFC 4226.
// Håndrullet med Node sin innebygde crypto for å unngå en ekstra avhengighet
// (GE-04, kap. 15). Kompatibel med Google Authenticator, Apple Kodegenerator
// og andre vanlige autentiserings-apper.

import { createHmac, randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binaryCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binaryCode % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

export function generateTotp(secretBase32: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verifiserer en 6-sifret kode. `window` er antall 30-sekundersteg tillatt
 * klokkedrift i hver retning (standard ±1 steg = ±30 sekunder).
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  window = 1,
  at: number = Date.now(),
): boolean {
  const cleanToken = token.trim();
  if (!/^\d{6}$/.test(cleanToken)) {
    return false;
  }
  const counter = Math.floor(at / 1000 / TOTP_STEP_SECONDS);
  const secret = base32Decode(secretBase32);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const code = hotp(secret, counter + errorWindow);
    if (timingSafeEqualStrings(code, cleanToken)) {
      return true;
    }
  }
  return false;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function buildOtpAuthUri(
  secretBase32: string,
  accountName: string,
  issuer = 'Pietra Unica CRM',
): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
