import { describe, expect, it } from 'vitest';

import { parseCamt053 } from '@/modules/bank-import/parse-camt053';
import { parseBankCsv } from '@/modules/bank-import/parse-csv';

describe('LE-08: CSV-kontoutskrift', () => {
  it('tolker en gyldig CSV med alle kolonner', () => {
    const csv = [
      'dato,beløp,valuta,kid,melding,motpart',
      '15.01.2024,"1 234,56",NOK,,Innbetaling ORD-1001,Kunde AS',
      '2024-01-16,-500.00,NOK,,Utbetaling faktura 2024-001,Leverandør Srl',
    ].join('\n');

    const transactions = parseBankCsv(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      amountMinor: 123_456,
      currency: 'NOK',
      reference: 'Innbetaling ORD-1001',
      counterpartyName: 'Kunde AS',
    });
    expect(transactions[0]!.bookingDate.toISOString().slice(0, 10)).toBe('2024-01-15');
    expect(transactions[1]!.amountMinor).toBe(-50_000);
  });

  it('hopper over rader med ugyldig beløp i stedet for å avbryte hele importen', () => {
    const csv = ['dato,beløp', '2024-01-01,ikke-et-beløp', '2024-01-02,100,00'].join('\n');
    const transactions = parseBankCsv(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.amountMinor).toBe(10_000);
  });

  it('kaster tydelig feil når påkrevde kolonner mangler', () => {
    const csv = ['motpart,melding', 'Kunde AS,Innbetaling'].join('\n');
    expect(() => parseBankCsv(csv)).toThrow(/mangler påkrevde kolonner/);
  });
});

describe('LE-08: CAMT.053-kontoutskrift', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Document>
  <BkToCstmrStmt>
    <Stmt>
      <Ntry>
        <Amt Ccy="NOK">1234.56</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2024-01-15</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <RmtInf><Ustrd>KID: 123456789012 betaling ordre</Ustrd></RmtInf>
            <RltdPties><Dbtr><Nm>Kunde AS</Nm></Dbtr></RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="NOK">500.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2024-01-16</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <RmtInf><Ustrd>Faktura 2024-001</Ustrd></RmtInf>
            <RltdPties><Cdtr><Nm>Leverandør Srl</Nm></Cdtr></RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

  it('tolker innbetaling (CRDT) med positivt beløp og KID uttrukket fra meldingen', () => {
    const transactions = parseCamt053(sampleXml);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      amountMinor: 123_456,
      currency: 'NOK',
      kid: '123456789012',
    });
  });

  it('tolker utbetaling (DBIT) som negativt beløp', () => {
    const transactions = parseCamt053(sampleXml);
    expect(transactions[1]!.amountMinor).toBe(-50_000);
    expect(transactions[1]!.kid).toBeNull();
  });
});
