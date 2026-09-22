// LE-08: felles form for én transaksjon uttrukket fra en kontoutskrift
// (CAMT.053 eller CSV), før matching mot kunde-/leverandørfaktura.
export interface ParsedBankTransaction {
  bookingDate: Date;
  amountMinor: number;
  currency: string;
  kid: string | null;
  reference: string | null;
  counterpartyName: string | null;
}
