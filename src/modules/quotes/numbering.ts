// TO-15: løpende nummerering fra oppstart med prefiks per type. Numrene
// hentes fra ekte Postgres-sekvenser (prisma/migrations/…m5_quotes_orders),
// aldri en tellerkolonne, slik at de aldri gjenbrukes – heller ikke ved
// samtidige forespørsler eller sletting.
import { prisma } from '@/lib/db';

async function nextval(sequence: 'quote_number_seq' | 'order_number_seq'): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ val: bigint }[]>(`SELECT nextval('${sequence}') AS val`);
  return Number(rows[0]!.val);
}

/** Nytt tilbud (revisjon 1) får et nytt løpenummer fra sekvensen. */
export async function nextQuoteBaseNumber(): Promise<number> {
  return nextval('quote_number_seq');
}

export async function nextOrderNumber(): Promise<string> {
  const value = await nextval('order_number_seq');
  return `O-${value}`;
}

/** TO-10: revisjon 1 vises uten suffiks, senere revisjoner får «-2», «-3», … */
export function formatQuoteNumber(baseNumber: number, revision: number): string {
  return revision <= 1 ? `T-${baseNumber}` : `T-${baseNumber}-${revision}`;
}
