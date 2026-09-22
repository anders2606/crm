import { describe, expect, it } from 'vitest';

import { convertMinorUnitsToNokOre, formatMoney, parseMoneyToCents } from '@/lib/money';

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

  it('regner om fremmed valuta til NOK-øre med skalert heltallskurs (MA-03)', () => {
    // 100,00 EUR (10 000 cent) med kurs 11,5000 NOK/EUR -> 1 150,00 NOK.
    expect(convertMinorUnitsToNokOre(10_000, 11_500_000)).toBe(115_000);
  });

  it('avrunder til nærmeste øre ved valutaomregning', () => {
    // 1 cent (0,01 EUR) med kurs 11,5555 NOK/EUR -> 0,115555 NOK = 11,5555 øre -> avrundes til 12.
    expect(convertMinorUnitsToNokOre(1, 11_555_500)).toBe(12);
    // 1 cent med en mye lavere kurs avrundes ned til 0 øre.
    expect(convertMinorUnitsToNokOre(1, 30_000)).toBe(0);
  });
});
