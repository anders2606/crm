// TO-06: tilbud genereres som PDF og sendes direkte fra systemet. Selve
// SMTP-kallet skjer kun i workeren (arbeidsregel 12, src/worker/index.ts);
// denne modulen deles mellom serveraksjonen (som bare forbereder og
// fryser innholdet) og workeren (som utfører selve sendingen).
import type { QuoteSendJobData } from '@/lib/jobs';
import { prisma } from '@/lib/db';
import { getMailClient } from '@/integrations/mail';
import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { decryptSecret } from '@/lib/secrets';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { saveDocumentBuffer } from '@/modules/documents/service';
import { computeNextFollowUpAt, resolveFollowUpRule } from '@/modules/quotes/followup';
import {
  calculateLineAmounts,
  calculateLineCostMinor,
  calculateLineDb,
  calculateQuoteDb,
  calculateQuoteTotals,
  getMaterialUnitCostNokMinor,
} from '@/modules/quotes/pricing';
import { renderQuotePdf } from '@/modules/quotes/pdf';
import { buildTermsSnapshot, resolveTemplate } from '@/modules/templates/service';

/** TO-05: regner ut og lagrer sum/rabatt/MVA/DB på nytt etter enhver linjeendring. */
export async function recalculateQuoteTotals(quoteId: string): Promise<void> {
  const lines = await prisma.quoteLine.findMany({ where: { quoteId }, orderBy: { sortOrder: 'asc' } });

  const amounts = lines.map((line) =>
    calculateLineAmounts({
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
      discountPercent: line.discountPercent,
      vatRatePercent: line.vatRatePercent,
    }),
  );

  const totals = calculateQuoteTotals(amounts);

  const dbAmounts = await Promise.all(
    lines.map(async (line, index) => {
      const costUnitMinor = line.materialId ? await getMaterialUnitCostNokMinor(line.materialId) : null;
      const costMinor = costUnitMinor !== null ? calculateLineCostMinor(line.quantityMilli, costUnitMinor) : null;
      return calculateLineDb(amounts[index]!.lineTotalMinor, costMinor);
    }),
  );

  await prisma.$transaction([
    ...lines.map((line, index) =>
      prisma.quoteLine.update({ where: { id: line.id }, data: { lineTotalMinor: amounts[index]!.lineTotalMinor } }),
    ),
    prisma.quote.update({
      where: { id: quoteId },
      data: {
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        vatMinor: totals.vatMinor,
        totalMinor: totals.totalMinor,
        dbMinor: calculateQuoteDb(dbAmounts),
      },
    }),
  ]);
}

export interface PrepareQuoteForSendingResult {
  quoteId: string;
  recipientEmail: string | null;
}

/**
 * Fryser vilkår/tekstblokkinnhold (SD-04) og selve PDF-innholdet før tilbudet
 * legges i sendekøen. Kjøres i serveraksjonen – ingen ekstern systemtilgang
 * her, kun databaseoppslag og -skriving.
 */
export async function prepareQuoteForSending(quoteId: string): Promise<PrepareQuoteForSendingResult> {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { customer: { include: { groups: true } } },
  });

  const template = await resolveTemplate({
    type: 'QUOTE',
    language: quote.language,
    customerGroupId: quote.customer.groups[0]?.id ?? null,
  });

  const textBlocks = quote.selectedTextBlockIds.length
    ? await prisma.textBlock.findMany({ where: { id: { in: quote.selectedTextBlockIds }, isCurrent: true } })
    : [];

  const termsSnapshot = buildTermsSnapshot(template?.content ?? '', textBlocks);

  await prisma.quote.update({
    where: { id: quoteId },
    data: { termsSnapshot, templateId: template?.id ?? null },
  });

  return { quoteId, recipientEmail: quote.customer.email };
}

/**
 * Selve leveringen: kjøres KUN fra workeren (arbeidsregel 12). Sender e-post
 * med PDF-vedlegg, arkiverer PDF-en som dokument på kunden (TO-06), setter
 * status «sendt» og regner ut neste automatiske oppfølgingsdato (OP-03).
 */
export async function deliverQuote(data: QuoteSendJobData): Promise<void> {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: data.quoteId },
    include: {
      customer: { include: { addresses: true, groups: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
    },
  });

  const emailAccount = await prisma.emailAccount.findUniqueOrThrow({ where: { id: data.emailAccountId } });

  if (!quote.customer.email) {
    throw new Error(`Kunde ${quote.customer.name} mangler e-postadresse – kan ikke sende tilbud ${quote.number}`);
  }

  const invoiceAddress = quote.customer.addresses.find((a) => a.type === 'INVOICE') ?? quote.customer.addresses[0];
  const customerAddress = invoiceAddress
    ? `${invoiceAddress.street}, ${invoiceAddress.postalCode} ${invoiceAddress.city}`
    : null;

  const pdfBuffer = await renderQuotePdf({
    number: quote.number,
    status: quote.status,
    currency: quote.currency,
    validUntil: quote.validUntil,
    createdAt: quote.createdAt,
    customerName: quote.customer.name,
    customerAddress,
    lines: quote.lines.map((line) => ({
      description: line.description,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      unitPriceMinor: line.unitPriceMinor,
      discountPercent: line.discountPercent,
      lineTotalMinor: line.lineTotalMinor,
    })),
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    vatMinor: quote.vatMinor,
    totalMinor: quote.totalMinor,
    termsSnapshot: quote.termsSnapshot,
  });

  const fileName = `${quote.number}.pdf`;

  const client = getMailClient();
  await client.sendAndArchive(
    {
      address: emailAccount.address,
      username: emailAccount.username,
      password: decryptSecret(emailAccount.encryptedPassword),
      imapHost: emailAccount.imapHost,
      imapPort: emailAccount.imapPort,
      smtpHost: emailAccount.smtpHost,
      smtpPort: emailAccount.smtpPort,
    },
    {
      to: [quote.customer.email],
      subject: `Tilbud ${quote.number} fra Pietra Unica`,
      text: quote.termsSnapshot ?? `Vedlagt følger tilbud ${quote.number}.`,
      attachments: [{ filename: fileName, contentType: 'application/pdf', content: pdfBuffer }],
    },
  );

  await saveDocumentBuffer({
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: quote.customerId,
    category: 'QUOTE_SENT',
    fileName,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
    userId: data.userId,
  });

  const followUpRule = await resolveFollowUpRule({
    quoteId: quote.id,
    customerId: quote.customerId,
    customerGroupIds: quote.customer.groups.map((group) => group.id),
  });

  const sentAt = new Date();
  const nextFollowUpAt =
    followUpRule?.active && followUpRule.daysSequence.length > 0
      ? computeNextFollowUpAt(sentAt, followUpRule.daysSequence, 0)
      : null;

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: 'SENT',
      sentAt,
      sentViaEmailAccountId: emailAccount.id,
      followUpsSent: 0,
      nextFollowUpAt,
    },
  });

  await recordActivity({
    type: 'EMAIL',
    text: `Tilbud ${quote.number} sendt til ${quote.customer.email}`,
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: quote.customerId,
    createdById: data.userId,
  });

  await logAudit({
    userId: data.userId,
    action: 'update',
    entityType: ENTITY_TYPES.QUOTE,
    entityId: quote.id,
    after: { status: 'SENT', sentAt },
  });
}
