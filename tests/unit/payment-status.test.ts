import { describe, expect, it } from 'vitest';

import { computeInvoicePaymentStatus } from '@/modules/poweroffice/payment-status';

describe('BI-02/03/IN-10–12: betalingsstatus regnes alltid ut fra PowerOffice sin Balance/TotalAmount', () => {
  it('er UNPAID når hele beløpet gjenstår', () => {
    expect(computeInvoicePaymentStatus(100_000, 100_000)).toBe('UNPAID');
  });

  it('er PARTIALLY_PAID når noe, men ikke alt, er betalt', () => {
    expect(computeInvoicePaymentStatus(40_000, 100_000)).toBe('PARTIALLY_PAID');
  });

  it('er PAID når balansen er null', () => {
    expect(computeInvoicePaymentStatus(0, 100_000)).toBe('PAID');
  });

  it('er PAID når balansen er negativ (f.eks. overbetaling/kreditnota)', () => {
    expect(computeInvoicePaymentStatus(-500, 100_000)).toBe('PAID');
  });
});
