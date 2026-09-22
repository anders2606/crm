'use server';

import { redirect } from 'next/navigation';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { formatQuoteNumber, nextQuoteBaseNumber } from '@/modules/quotes/numbering';

// TO-01: gyldighet settes automatisk (kan justeres av selger før sending).
const DEFAULT_VALIDITY_DAYS = 30;

export async function createQuote(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.QUOTE_WRITE);
  const customerId = String(formData.get('customerId') ?? '');
  const language = String(formData.get('language') ?? 'nb').trim() || 'nb';

  if (!customerId) {
    redirect('/quotes/new?error=missing_customer');
  }

  const baseNumber = await nextQuoteBaseNumber();
  const number = formatQuoteNumber(baseNumber, 1);
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + DEFAULT_VALIDITY_DAYS);

  const id = crypto.randomUUID();
  const quote = await prisma.quote.create({
    data: {
      id,
      groupId: id,
      customerId,
      baseNumber,
      number,
      revision: 1,
      isCurrent: true,
      language,
      validUntil,
      createdById: session.id,
    },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: ENTITY_TYPES.QUOTE,
    entityId: quote.id,
    after: { number: quote.number, customerId },
  });

  redirect(`/quotes/${quote.id}`);
}
