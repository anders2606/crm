import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('passordhash (M0 fundament)', () => {
  it('verifiserer riktig passord', async () => {
    const stored = await hashPassword('korrekt-passord-123');
    await expect(verifyPassword('korrekt-passord-123', stored)).resolves.toBe(true);
  });

  it('avviser feil passord', async () => {
    const stored = await hashPassword('korrekt-passord-123');
    await expect(verifyPassword('feil-passord', stored)).resolves.toBe(false);
  });

  it('bruker tilfeldig salt, så samme passord gir ulike hasher', async () => {
    const a = await hashPassword('samme-passord');
    const b = await hashPassword('samme-passord');
    expect(a).not.toBe(b);
    await expect(verifyPassword('samme-passord', a)).resolves.toBe(true);
    await expect(verifyPassword('samme-passord', b)).resolves.toBe(true);
  });

  it('avviser ugyldig lagret format i stedet for å kaste feil', async () => {
    await expect(verifyPassword('hva-som-helst', 'ikke-en-gyldig-hash')).resolves.toBe(false);
  });
});
