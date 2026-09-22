// BI-02/03/IN-10–12: status regnes alltid ut fra PowerOffice sin egen
// Balance/TotalAmount – CRM tolker aldri selv om en faktura er betalt.
import type { InvoicePaymentStatus } from '@prisma/client';

export function computeInvoicePaymentStatus(balanceMinor: number, totalAmountMinor: number): InvoicePaymentStatus {
  if (balanceMinor <= 0) {
    return 'PAID';
  }
  if (balanceMinor < totalAmountMinor) {
    return 'PARTIALLY_PAID';
  }
  return 'UNPAID';
}

export const INVOICE_PAYMENT_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  UNPAID: 'Ubetalt',
  PARTIALLY_PAID: 'Delvis betalt',
  PAID: 'Betalt',
};
