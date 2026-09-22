// LE-08 reserve: CSV-kontoutskrift fra nettbank bedrift. Ingen enkelt CSV-
// standard finnes på tvers av banker (i motsetning til CAMT.053), så CRM
// forventer disse kolonnene (rekkefølge fri, case ignoreres, norske
// tegnsettvarianter støttet): dato, beløp, valuta (valgfri, standard NOK),
// kid (valgfri), melding/referanse (valgfri), motpart/navn (valgfri).
import { parseMoneyToCents } from '@/lib/money';

import type { ParsedBankTransaction } from './types';

const HEADER_ALIASES: Record<string, keyof ParsedBankTransaction | 'skip'> = {
  dato: 'bookingDate',
  bokføringsdato: 'bookingDate',
  beløp: 'amountMinor',
  belop: 'amountMinor',
  valuta: 'currency',
  kid: 'kid',
  melding: 'reference',
  referanse: 'reference',
  tekst: 'reference',
  motpart: 'counterpartyName',
  navn: 'counterpartyName',
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',' || char === ';') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseNorwegianDate(value: string): Date {
  // Støtter både ISO (2024-01-15) og norsk (15.01.2024).
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }
  const norwegianMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (norwegianMatch) {
    return new Date(Date.UTC(Number(norwegianMatch[3]), Number(norwegianMatch[2]) - 1, Number(norwegianMatch[1])));
  }
  throw new Error(`Ugjenkjennelig datoformat i kontoutskrift: "${value}"`);
}

export function parseBankCsv(content: string): ParsedBankTransaction[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    return [];
  }

  const headerFields = parseCsvLine(lines[0]!).map((field) => field.toLowerCase());
  const columnIndex = new Map<keyof ParsedBankTransaction, number>();
  headerFields.forEach((header, index) => {
    const mapped = HEADER_ALIASES[header];
    if (mapped && mapped !== 'skip') {
      columnIndex.set(mapped, index);
    }
  });

  const dateIndex = columnIndex.get('bookingDate');
  const amountIndex = columnIndex.get('amountMinor');
  if (dateIndex === undefined || amountIndex === undefined) {
    throw new Error('CSV-filen mangler påkrevde kolonner: "dato" og "beløp".');
  }

  const transactions: ParsedBankTransaction[] = [];
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const amountMinor = parseMoneyToCents(fields[amountIndex] ?? '');
    if (amountMinor === null) {
      continue; // tom/ugyldig rad, hopp over i stedet for å avbryte hele importen
    }

    const currencyIndex = columnIndex.get('currency');
    const kidIndex = columnIndex.get('kid');
    const referenceIndex = columnIndex.get('reference');
    const counterpartyIndex = columnIndex.get('counterpartyName');

    transactions.push({
      bookingDate: parseNorwegianDate(fields[dateIndex] ?? ''),
      amountMinor,
      currency: (currencyIndex !== undefined ? fields[currencyIndex] : '') || 'NOK',
      kid: (kidIndex !== undefined ? fields[kidIndex] : '') || null,
      reference: (referenceIndex !== undefined ? fields[referenceIndex] : '') || null,
      counterpartyName: (counterpartyIndex !== undefined ? fields[counterpartyIndex] : '') || null,
    });
  }

  return transactions;
}
