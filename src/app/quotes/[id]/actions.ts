'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { QuoteStatus } from '@prisma/client';

import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { enqueueQuoteSend } from '@/lib/jobs';
import { parseMoneyToCents } from '@/lib/money';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { getAccessibleEmailAccounts } from '@/modules/email/access';
import { formatQuoteNumber } from '@/modules/quotes/numbering';
import { parseQuantityToMilli } from '@/modules/quotes/pricing';
import { prepareQuoteForSending, recalculateQuoteTotals } from '@/modules/quotes/send';

function requireQuoteWrite() {
  return requirePermission(PERMISSIONS.QUOTE_WRITE);
}

async function requireDraftQuote(quoteId: string) {
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  if (quote.status !== 'DRAFT') {
    throw new Error('Kun tilbud i status «utkast» kan endres. Lag en ny revisjon for å gjøre endringer.');
  }
  return quote;
}

// TO-04: linjer kan hentes fra materialbiblioteket eller skrives fritt.
export async function addQuoteLine(formData: FormData): Promise<void> {
  await requireQuoteWrite();
  const quoteId = String(formData.get('quoteId') ?? '');
  await requireDraftQuote(quoteId);

  const materialId = String(formData.get('materialId') ?? '').trim() || null;
  let description = String(formData.get('description') ?? '').trim();
  let unit = String(formData.get('unit') ?? '').trim();
  let unitPriceMinor = parseMoneyToCents(String(formData.get('unitPrice') ?? '').trim());

  if (materialId) {
    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (material && !description) {
      description = material.tradeName ?? material.name;
    }
    if (!unit || unitPriceMinor === null) {
      const latestSale = await prisma.priceEntry.findFirst({
        where: { materialId, type: 'SALE' },
        orderBy: { priceDate: 'desc' },
      });
      if (latestSale) {
        unit = unit || latestSale.unit;
        unitPriceMinor = unitPriceMinor ?? latestSale.amountNokMinor;
      }
    }
  }

  const quantityMilli = parseQuantityToMilli(String(formData.get('quantity') ?? '').trim());
  const discountPercent = Number(formData.get('discountPercent') ?? 0) || 0;
  const vatRatePercent = Number(formData.get('vatRatePercent') ?? 25) || 25;

  if (!description || !unit || quantityMilli === null || unitPriceMinor === null) {
    redirect(`/quotes/${quoteId}?error=missing_line_fields`);
  }

  await prisma.quoteLine.create({
    data: {
      quoteId,
      materialId,
      description,
      unit,
      quantityMilli,
      unitPriceMinor,
      discountPercent,
      vatRatePercent,
      lineTotalMinor: 0, // regnes ut av recalculateQuoteTotals rett under
    },
  });

  await recalculateQuoteTotals(quoteId);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function removeQuoteLine(formData: FormData): Promise<void> {
  await requireQuoteWrite();
  const lineId = String(formData.get('lineId') ?? '');
  const line = await prisma.quoteLine.findUniqueOrThrow({ where: { id: lineId } });
  await requireDraftQuote(line.quoteId);

  await prisma.quoteLine.delete({ where: { id: lineId } });
  await recalculateQuoteTotals(line.quoteId);
  revalidatePath(`/quotes/${line.quoteId}`);
}

export async function updateQuoteMeta(formData: FormData): Promise<void> {
  const session = await requireQuoteWrite();
  const quoteId = String(formData.get('quoteId') ?? '');
  await requireDraftQuote(quoteId);

  const validUntilInput = String(formData.get('validUntil') ?? '').trim();
  const selectedTextBlockIds = formData.getAll('textBlockIds').map(String);

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      validUntil: validUntilInput ? new Date(validUntilInput) : null,
      selectedTextBlockIds,
    },
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: ENTITY_TYPES.QUOTE,
    entityId: quoteId,
    after: { validUntil: validUntilInput, selectedTextBlockIds },
  });

  revalidatePath(`/quotes/${quoteId}`);
}

// TO-06: fryser innhold og legger tilbudet i sendekøen. Selve SMTP-kallet
// skjer kun i workeren (arbeidsregel 12, src/modules/quotes/send.ts).
export async function requestSendQuote(formData: FormData): Promise<void> {
  const session = await requireQuoteWrite();
  const quoteId = String(formData.get('quoteId') ?? '');
  const emailAccountId = String(formData.get('emailAccountId') ?? '');

  const quote = await requireDraftQuote(quoteId);
  const lineCount = await prisma.quoteLine.count({ where: { quoteId } });

  if (lineCount === 0 || !emailAccountId) {
    redirect(`/quotes/${quoteId}?error=cannot_send`);
  }

  const accessibleAccounts = await getAccessibleEmailAccounts(session.id);
  if (!accessibleAccounts.some((account) => account.id === emailAccountId)) {
    redirect(`/quotes/${quoteId}?error=cannot_send`);
  }

  const { recipientEmail } = await prepareQuoteForSending(quoteId);
  if (!recipientEmail) {
    redirect(`/quotes/${quoteId}?error=missing_customer_email`);
  }

  await enqueueQuoteSend({ quoteId, emailAccountId, userId: session.id });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: ENTITY_TYPES.QUOTE,
    entityId: quoteId,
    after: { queuedForSending: true, number: quote.number },
  });

  revalidatePath(`/quotes/${quoteId}`);
}

const MANUAL_STATUSES: QuoteStatus[] = ['ANSWERED', 'ACCEPTED', 'REJECTED'];

// TO-07: status og årsak ved tap.
export async function setQuoteStatus(formData: FormData): Promise<void> {
  const session = await requireQuoteWrite();
  const quoteId = String(formData.get('quoteId') ?? '');
  const status = formData.get('status') as QuoteStatus;
  const lostReason = String(formData.get('lostReason') ?? '').trim() || null;

  if (!MANUAL_STATUSES.includes(status)) {
    redirect(`/quotes/${quoteId}?error=invalid_status`);
  }
  if (status === 'REJECTED' && !lostReason) {
    redirect(`/quotes/${quoteId}?error=missing_lost_reason`);
  }

  const before = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status,
      lostReason: status === 'REJECTED' ? lostReason : before.lostReason,
      respondedAt: before.respondedAt ?? new Date(),
      // OP-04: automatisk oppfølging stopper når tilbudet får ny status.
      nextFollowUpAt: null,
    },
  });

  await recordActivity({
    type: 'STATUS',
    text: `Tilbud ${before.number} satt til status: ${status}`,
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: before.customerId,
    createdById: session.id,
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: ENTITY_TYPES.QUOTE,
    entityId: quoteId,
    before: { status: before.status },
    after: { status },
  });

  revalidatePath(`/quotes/${quoteId}`);
}

// TO-10: revisjon av tilbud – ny versjon med eget suffiks (T-10001-2),
// tidligere revisjon beholdes uendret og forblir tilgjengelig.
export async function createQuoteRevision(formData: FormData): Promise<void> {
  const session = await requireQuoteWrite();
  const quoteId = String(formData.get('quoteId') ?? '');

  const current = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: true } });
  if (!current.isCurrent) {
    redirect(`/quotes/${quoteId}?error=not_current`);
  }

  const newId = crypto.randomUUID();
  const revision = current.revision + 1;

  await prisma.$transaction([
    prisma.quote.update({ where: { id: current.id }, data: { isCurrent: false } }),
    prisma.quote.create({
      data: {
        id: newId,
        groupId: current.groupId,
        baseNumber: current.baseNumber,
        revision,
        isCurrent: true,
        number: formatQuoteNumber(current.baseNumber, revision),
        status: 'DRAFT',
        customerId: current.customerId,
        language: current.language,
        validUntil: current.validUntil,
        selectedTextBlockIds: current.selectedTextBlockIds,
        currency: current.currency,
        createdById: session.id,
        lines: {
          create: current.lines.map((line) => ({
            materialId: line.materialId,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unit: line.unit,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatRatePercent: line.vatRatePercent,
            lineTotalMinor: line.lineTotalMinor,
            sortOrder: line.sortOrder,
          })),
        },
      },
    }),
  ]);

  await recalculateQuoteTotals(newId);

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: ENTITY_TYPES.QUOTE,
    entityId: newId,
    after: { revisionOf: current.number, number: formatQuoteNumber(current.baseNumber, revision) },
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${newId}`);
}
