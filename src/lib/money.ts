// Arbeidsregel 10: penger lagres som heltall i øre/cent med valutakode,
// aldri som flyttall. Disse hjelperne konverterer kun til/fra norsk
// tallformat (1 234,50) for visning og inntasting.
const AMOUNT_FORMATTER = new Intl.NumberFormat('nb-NO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(cents: number, currency = 'NOK'): string {
  return `${AMOUNT_FORMATTER.format(cents / 100)} ${currency}`;
}

/**
 * Tolker et norsk-formatert beløp ("1 234,50" eller "1234.50") til heltall i
 * øre/cent. Returnerer `null` ved tomt felt eller ugyldig input.
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/[\s ]/g, '')
    .replace(',', '.');

  if (cleaned === '') {
    return null;
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100);
}
