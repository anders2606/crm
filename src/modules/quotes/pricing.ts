// TO-05: automatisk beregning av sum, rabatt, MVA og dekningsbidrag (DB).
// Rene funksjoner uten databasetilgang, slik at forretningsregelen for
// beløp/MVA kan enhetstestes uavhengig av Prisma (arbeidsregel 4).
//
// Konvensjon (norsk tilbudsvisning): «Sum» er linjenes brutto beløp før
// rabatt, «Rabatt» er summen av linjenes egne rabatter, «MVA» beregnes per
// linje på linjens nettobeløp (etter rabatt) med linjens egen MVA-sats, og
// «Totalt» = Sum − Rabatt + MVA. Alle mellomregninger avrundes til nærmeste
// øre med samme Math.round-konvensjon som resten av systemet (src/lib/money.ts).
import { prisma } from '@/lib/db';

export interface QuoteLineInput {
  quantityMilli: number;
  unitPriceMinor: number;
  discountPercent: number;
  vatRatePercent: number;
}

export interface QuoteLineAmounts {
  /** Brutto beløp før rabatt (antall × enhetspris), i øre. */
  grossMinor: number;
  /** Rabatt på denne linjen, i øre. */
  discountMinor: number;
  /** Netto linjesum etter rabatt, eks. MVA – lagres som QuoteLine.lineTotalMinor. */
  lineTotalMinor: number;
  /** MVA på denne linjen, beregnet av lineTotalMinor. */
  vatMinor: number;
  /** Linjesum inkl. MVA. */
  totalInclVatMinor: number;
}

export function calculateLineAmounts(line: QuoteLineInput): QuoteLineAmounts {
  const grossMinor = Math.round((line.quantityMilli * line.unitPriceMinor) / 1000);
  const discountMinor = Math.round((grossMinor * line.discountPercent) / 100);
  const lineTotalMinor = grossMinor - discountMinor;
  const vatMinor = Math.round((lineTotalMinor * line.vatRatePercent) / 100);
  return {
    grossMinor,
    discountMinor,
    lineTotalMinor,
    vatMinor,
    totalInclVatMinor: lineTotalMinor + vatMinor,
  };
}

export interface QuoteTotals {
  subtotalMinor: number;
  discountMinor: number;
  vatMinor: number;
  totalMinor: number;
}

export function calculateQuoteTotals(lines: QuoteLineAmounts[]): QuoteTotals {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.grossMinor, 0);
  const discountMinor = lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const vatMinor = lines.reduce((sum, line) => sum + line.vatMinor, 0);
  const totalMinor = subtotalMinor - discountMinor + vatMinor;
  return { subtotalMinor, discountMinor, vatMinor, totalMinor };
}

/**
 * Dekningsbidrag for én linje: netto linjesum minus kjent innkjøpskostnad.
 * Er kostprisen ukjent (fritekstlinje, eller materiale uten registrert
 * innkjøpspris), regnes hele linjesummen som DB for den linjen – DB vises
 * kun internt (TO-05) og er ment som en indikasjon, ikke et regnskapstall.
 */
export function calculateLineDb(lineTotalMinor: number, costMinor: number | null): number {
  return lineTotalMinor - (costMinor ?? 0);
}

export function calculateQuoteDb(lineDbAmounts: number[]): number {
  return lineDbAmounts.reduce((sum, value) => sum + value, 0);
}

/**
 * Henter siste kjente innkjøpspris for materialet, i NOK-øre per enhet
 * (MA-03/MA-04). Brukes til dekningsbidrag – kun til internt bruk.
 */
export async function getMaterialUnitCostNokMinor(materialId: string): Promise<number | null> {
  const entry = await prisma.priceEntry.findFirst({
    where: { materialId, type: 'PURCHASE' },
    orderBy: { priceDate: 'desc' },
  });
  return entry?.amountNokMinor ?? null;
}

/** Kostnad for en hel linje: enhetskost × antall (tusendeler, se QuoteLine.quantityMilli). */
export function calculateLineCostMinor(quantityMilli: number, unitCostNokMinor: number): number {
  return Math.round((quantityMilli * unitCostNokMinor) / 1000);
}
