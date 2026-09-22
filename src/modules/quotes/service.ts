import type { OrderStatus, QuoteStatus } from '@prisma/client';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Utkast',
  SENT: 'Sendt',
  ANSWERED: 'Besvart',
  ACCEPTED: 'Akseptert',
  REJECTED: 'Avslått',
  EXPIRED: 'Utløpt',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CONFIRMED: 'Bekreftet',
  IN_PRODUCTION: 'I produksjon',
  DELIVERED: 'Levert',
  CANCELLED: 'Kansellert',
};

/** OP-07: status som fortsatt regnes som et «åpent» tilbud i pipelinen. */
export const OPEN_QUOTE_STATUSES: QuoteStatus[] = ['DRAFT', 'SENT', 'ANSWERED'];
