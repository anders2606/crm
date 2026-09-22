// M4/MA-03: henting og oppslag av valutakurser. Selve HTTP-kallet skjer kun
// fra workeren (arbeidsregel 12) via src/integrations/exchange-rates;
// oppslag her leser bare den lokalt lagrede tabellen.
import { getExchangeRateProvider } from '@/integrations/exchange-rates';
import { prisma } from '@/lib/db';
import { convertMinorUnitsToNokOre } from '@/lib/money';

function toDateOnlyUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatIsoDate(date: Date): string {
  return toDateOnlyUtc(date).toISOString().slice(0, 10);
}

/** Henter og lagrer kurser for en valuta i en periode. Returnerer antall lagrede observasjoner. */
export async function syncExchangeRates(currency: string, from: Date, to: Date): Promise<number> {
  if (currency === 'NOK') {
    return 0;
  }

  const provider = getExchangeRateProvider();
  const observations = await provider.fetchRates(currency, formatIsoDate(from), formatIsoDate(to));

  let count = 0;
  for (const observation of observations) {
    const microNokPerUnit = Math.round(observation.rate * 1_000_000);
    await prisma.exchangeRate.upsert({
      where: { currency_date: { currency, date: new Date(observation.date) } },
      update: { microNokPerUnit },
      create: { currency, date: new Date(observation.date), microNokPerUnit },
    });
    count += 1;
  }
  return count;
}

/**
 * NOK × 1 000 000 per 1 enhet av valutaen, for en gitt dato. Mangler kurs
 * for datoen (helg/helligdag), brukes siste kurs før (kap. 18).
 */
export async function getMicroNokPerUnit(currency: string, date: Date): Promise<number | null> {
  if (currency === 'NOK') {
    return 1_000_000;
  }

  const target = toDateOnlyUtc(date);
  const exact = await prisma.exchangeRate.findUnique({
    where: { currency_date: { currency, date: target } },
  });
  if (exact) {
    return exact.microNokPerUnit;
  }

  const previous = await prisma.exchangeRate.findFirst({
    where: { currency, date: { lte: target } },
    orderBy: { date: 'desc' },
  });
  return previous?.microNokPerUnit ?? null;
}

export interface ConversionResult {
  amountNokMinor: number;
  microNokPerUnit: number;
}

export async function convertToNok(
  amountMinorUnits: number,
  currency: string,
  date: Date,
): Promise<ConversionResult | null> {
  const microNokPerUnit = await getMicroNokPerUnit(currency, date);
  if (microNokPerUnit === null) {
    return null;
  }
  return {
    amountNokMinor: convertMinorUnitsToNokOre(amountMinorUnits, microNokPerUnit),
    microNokPerUnit,
  };
}
