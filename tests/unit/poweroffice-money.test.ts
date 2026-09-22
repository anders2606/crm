import { describe, expect, it } from 'vitest';

import { decimalToMinor, minorToDecimal } from '@/integrations/poweroffice/real';

describe('arbeidsregel 10: PowerOffice bruker desimaltall i kroner, CRM bruker heltall i øre', () => {
  it('regner om fra øre til kroner (desimaltall) for utgående kall', () => {
    expect(minorToDecimal(150_000)).toBe(1500);
    expect(minorToDecimal(99)).toBe(0.99);
    expect(minorToDecimal(100)).toBe(1);
  });

  it('regner om fra kroner (desimaltall) til øre for innkommende data, med avrunding', () => {
    expect(decimalToMinor(1500)).toBe(150_000);
    expect(decimalToMinor(502.25)).toBe(50_225);
    // Flyttallsavrunding: 8.5212 kr skal bli 852 øre, ikke 851 pga. flyttallsunøyaktighet.
    expect(decimalToMinor(8.5212)).toBe(852);
  });

  it('er reversible for vanlige beløp (ingen tap ved øre -> kroner -> øre)', () => {
    for (const minor of [0, 1, 99, 100, 12_345, 1_000_000]) {
      expect(decimalToMinor(minorToDecimal(minor))).toBe(minor);
    }
  });
});
