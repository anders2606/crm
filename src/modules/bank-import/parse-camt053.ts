// LE-08 reserve: CAMT.053 (ISO 20022 Bank-to-Customer Statement), det
// vanlige formatet norske bedriftsbanker tilbyr for kontoutskrift-eksport.
// Henter kun feltene CRM trenger (beløp, dato, KID/melding, motpart) fra
// hver <Ntry>-blokk med en enkel, avhengighetsfri tekstuttrekking i stedet
// for et fullt XML-DOM-bibliotek (arbeidsregel 11 – ingen ny avhengighet for
// en reserveløsning som kun leser noen få bladverdier per post).
import { parseMoneyToCents } from '@/lib/money';

import type { ParsedBankTransaction } from './types';

function extractTag(xml: string, tag: string): string | null {
  // Tåler et eventuelt navnerom-prefiks (f.eks. <ns:Amt Ccy="NOK">...).
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${tag}>`));
  return match ? match[1]!.trim() : null;
}

function extractAttribute(xml: string, tag: string, attribute: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*\\s${attribute}="([^"]*)"`));
  return match ? match[1]! : null;
}

function extractEntries(xml: string): string[] {
  const entries: string[] = [];
  const regex = /<(?:\w+:)?Ntry(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?Ntry>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    entries.push(match[1]!);
  }
  return entries;
}

export function parseCamt053(xml: string): ParsedBankTransaction[] {
  const transactions: ParsedBankTransaction[] = [];

  for (const entry of extractEntries(xml)) {
    const amountText = extractTag(entry, 'Amt');
    const bookingDateText = extractTag(entry, 'Dt') ?? extractTag(entry, 'DtTm');
    if (amountText === null || bookingDateText === null) {
      continue; // ufullstendig post, ikke tolkbar
    }

    const amountMinorAbsolute = parseMoneyToCents(amountText);
    if (amountMinorAbsolute === null) {
      continue;
    }

    const creditDebitIndicator = extractTag(entry, 'CdtDbtInd');
    const amountMinor = creditDebitIndicator === 'DBIT' ? -amountMinorAbsolute : amountMinorAbsolute;

    const currency = extractAttribute(entry, 'Amt', 'Ccy') ?? 'NOK';
    const reference = extractTag(entry, 'Ustrd');
    const debtorName = extractTag(entry, 'Nm');

    // KID ligger normalt i den ustrukturerte meldingen (Ustrd) for norske
    // bankfiler – finnes ikke som et eget standardisert CAMT-felt.
    const kidMatch = reference?.match(/\bKID:?\s*(\d{6,25})\b/i);

    transactions.push({
      bookingDate: new Date(bookingDateText.slice(0, 10)),
      amountMinor,
      currency,
      kid: kidMatch ? kidMatch[1]! : null,
      reference,
      counterpartyName: debtorName,
    });
  }

  return transactions;
}
