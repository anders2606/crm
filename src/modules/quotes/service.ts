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

/**
 * OP-07: enkel, statusbasert sannsynlighet for pipeline-oversikten. Ingen
 * egen datamodell for dette – kravet ber kun om at sannsynlighet vises, og
 * status er den eneste signalet systemet har uten manuell inntasting.
 */
export const QUOTE_PROBABILITY_BY_STATUS: Partial<Record<QuoteStatus, number>> = {
  DRAFT: 10,
  SENT: 30,
  ANSWERED: 60,
};
