import { beforeAll, describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from '@/lib/secrets';

describe('kryptering av e-postkontopassord (DR-08, midlertidig fram til M9)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY =
      '0'.repeat(63) + '1'; // gyldig 64-tegns hex-nøkkel, kun for denne testen
  });

  it('dekrypterer til samme verdi som ble kryptert', () => {
    const stored = encryptSecret('super-hemmelig-imap-passord');
    expect(decryptSecret(stored)).toBe('super-hemmelig-imap-passord');
  });

  it('bruker tilfeldig IV, så samme passord gir ulik lagret verdi', () => {
    const a = encryptSecret('samme-passord');
    const b = encryptSecret('samme-passord');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('samme-passord');
    expect(decryptSecret(b)).toBe('samme-passord');
  });

  it('avviser en manipulert lagret verdi (autentisering feiler)', () => {
    const stored = encryptSecret('passord');
    const tampered = stored.slice(0, -2) + '00';
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
