import { describe, expect, it } from 'vitest';

import {
  calculateLineAmounts,
  calculateLineCostMinor,
  calculateLineDb,
  calculateQuoteDb,
  calculateQuoteTotals,
} from '@/modules/quotes/pricing';

describe('TO-05: automatisk beregning av sum, rabatt, MVA og dekningsbidrag', () => {
  it('beregner brutto, rabatt, linjesum og MVA for en enkelt linje', () => {
    // 2,5 m² × 1000 kr/m² = 2500 kr, 10 % rabatt = 250 kr, 25 % MVA av 2250 kr = 562,50 kr
    const amounts = calculateLineAmounts({
      quantityMilli: 2500,
      unitPriceMinor: 100_000,
      discountPercent: 10,
      vatRatePercent: 25,
    });

    expect(amounts.grossMinor).toBe(250_000);
    expect(amounts.discountMinor).toBe(25_000);
    expect(amounts.lineTotalMinor).toBe(225_000);
    expect(amounts.vatMinor).toBe(56_250);
    expect(amounts.totalInclVatMinor).toBe(281_250);
  });

  it('avrunder til nærmeste øre ved brøktall (antall i tusendeler)', () => {
    // 1,333 stk × 300 kr = 399,90 kr -> 39990 øre
    const amounts = calculateLineAmounts({
      quantityMilli: 1333,
      unitPriceMinor: 30_000,
      discountPercent: 0,
      vatRatePercent: 25,
    });

    expect(amounts.grossMinor).toBe(39_990);
    expect(amounts.lineTotalMinor).toBe(39_990);
  });

  it('summerer flere linjer til tilbudstotaler', () => {
    const line1 = calculateLineAmounts({
      quantityMilli: 1000,
      unitPriceMinor: 100_000,
      discountPercent: 0,
      vatRatePercent: 25,
    });
    const line2 = calculateLineAmounts({
      quantityMilli: 2000,
      unitPriceMinor: 50_000,
      discountPercent: 20,
      vatRatePercent: 25,
    });

    const totals = calculateQuoteTotals([line1, line2]);

    // line1: 1 stk × 1000 kr = 1000 kr brutto, ingen rabatt, 250 kr mva
    // line2: 2 stk × 500 kr = 1000 kr brutto, 20 % rabatt = 200 kr, 800 kr netto, 200 kr mva
    expect(totals.subtotalMinor).toBe(200_000);
    expect(totals.discountMinor).toBe(20_000);
    expect(totals.vatMinor).toBe(45_000);
    expect(totals.totalMinor).toBe(225_000);
  });

  it('regner dekningsbidrag som linjesum minus kjent kostpris', () => {
    const costMinor = calculateLineCostMinor(2500, 40_000); // 2,5 m² × 400 kr/m²
    expect(costMinor).toBe(100_000);

    const db = calculateLineDb(225_000, costMinor);
    expect(db).toBe(125_000);
  });

  it('regner hele linjesummen som DB når kostpris er ukjent (fritekstlinje)', () => {
    expect(calculateLineDb(225_000, null)).toBe(225_000);
  });

  it('summerer DB for flere linjer', () => {
    expect(calculateQuoteDb([125_000, 225_000, -5_000])).toBe(345_000);
  });
});
