import { describe, expect, it } from 'vitest';

import { buildOtpAuthUri, generateTotp, generateTotpSecret, verifyTotp } from '@/lib/auth/totp';

describe('TOTP to-faktor (GE-04)', () => {
  it('genererer en gyldig kode som umiddelbart kan verifiseres', () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('avviser feil kode', () => {
    const secret = generateTotpSecret();
    const validCode = generateTotp(secret);
    const wrongCode = validCode === '000000' ? '111111' : '000000';
    expect(verifyTotp(secret, wrongCode)).toBe(false);
  });

  it('avviser koder med feil format', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '')).toBe(false);
  });

  it('tolererer klokkedrift innenfor vinduet, men ikke utenfor', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const oneStepAgo = now - 30_000;
    const threeStepsAgo = now - 90_000;

    const codeOneStepAgo = generateTotp(secret, oneStepAgo);
    const codeThreeStepsAgo = generateTotp(secret, threeStepsAgo);

    expect(verifyTotp(secret, codeOneStepAgo, 1, now)).toBe(true);
    expect(verifyTotp(secret, codeThreeStepsAgo, 1, now)).toBe(false);
  });

  it('bygger en otpauth-URI som kan limes inn i en autentiseringsapp', () => {
    const uri = buildOtpAuthUri('JBSWY3DPEHPK3PXP', 'selger@marmor.no');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('period=30');
    expect(uri).toContain('digits=6');
  });
});
