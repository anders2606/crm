// TO-08: akseptert tilbud konverteres til ordre med ett klikk, og
// ordrebekreftelse genereres fra mal. TO-09 (overføring til PowerOffice Go)
// kommer først i M6 – ordren merkes tydelig som ikke overført ennå
// (Order.transferredToPowerOffice), samme mønster som kundesynk i M1.
import type { Order } from '@prisma/client';

import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { saveDocumentBuffer } from '@/modules/documents/service';
import { nextOrderNumber } from '@/modules/quotes/numbering';
import { resolveTemplate } from '@/modules/templates/service';

import { renderOrderConfirmationPdf } from './pdf';

export class QuoteNotConvertibleError extends Error {}

export async function convertQuoteToOrder(quoteId: string, userId: string | null): Promise<Order> {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      customer: { include: { addresses: true, groups: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
      order: true,
    },
  });

  if (quote.status !== 'ACCEPTED') {
    throw new QuoteNotConvertibleError('Kun akseptert tilbud kan konverteres til ordre.');
  }
  if (quote.order) {
    throw new QuoteNotConvertibleError('Tilbudet er allerede konvertert til ordre.');
  }

  const number = await nextOrderNumber();

  const template = await resolveTemplate({
    type: 'ORDER_CONFIRMATION',
    language: quote.language,
    customerGroupId: quote.customer.groups[0]?.id ?? null,
  });

  const order = await prisma.order.create({
    data: {
      number,
      quoteId: quote.id,
      status: 'CONFIRMED',
      createdById: userId,
    },
  });

  const invoiceAddress = quote.customer.addresses.find((a) => a.type === 'INVOICE') ?? quote.customer.addresses[0];
  const customerAddress = invoiceAddress
    ? `${invoiceAddress.street}, ${invoiceAddress.postalCode} ${invoiceAddress.city}`
    : null;

  const pdfBuffer = await renderOrderConfirmationPdf({
    orderNumber: order.number,
    quoteNumber: quote.number,
    createdAt: order.createdAt,
    customerName: quote.customer.name,
    customerAddress,
    currency: quote.currency,
    lines: quote.lines.map((line) => ({ description: line.description, lineTotalMinor: line.lineTotalMinor })),
    totalMinor: quote.totalMinor,
    confirmationText: template?.content ?? null,
  });

  await saveDocumentBuffer({
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: quote.customerId,
    category: 'ORDER_CONFIRMATION',
    fileName: `${order.number}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
    userId,
  });

  await recordActivity({
    type: 'STATUS',
    text: `Tilbud ${quote.number} konvertert til ordre ${order.number}`,
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: quote.customerId,
    createdById: userId,
  });

  await logAudit({
    userId,
    action: 'create',
    entityType: ENTITY_TYPES.ORDER,
    entityId: order.id,
    after: { number: order.number, quoteId: quote.id },
  });

  return order;
}
