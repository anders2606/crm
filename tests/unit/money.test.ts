import { describe, expect, it } from 'vitest';

import { formatMoney, parseMoneyToCents } from '@/lib/money';

describe('penger som heltall i øre (arbeidsregel 10)', () => {
  it('formaterer øre til norsk tallformat med valutakode', () => {
    expect(formatMoney(123450, 'NOK')).toBe('1 234,50 NOK');
    expect(formatMoney(500, 'NOK')).toBe('5,00 NOK');
  });

  it('tolker norsk tallformat til heltall i øre', () => {
    expect(parseMoneyToCents('1 234,50')).toBe(123450);
    expect(parseMoneyToCents('1234,5')).toBe(123450);
    expect(parseMoneyToCents('1234.50')).toBe(123450);
  });

  it('returnerer null for tomt eller ugyldig felt', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('   ')).toBeNull();
    expect(parseMoneyToCents('ikke et tall')).toBeNull();
  });

  it('rundes til nærmeste øre for å unngå flyttallsfeil', () => {
    expect(parseMoneyToCents('10.005')).toBe(1001); // 1000.5 -> avrundes opp
  });
});
