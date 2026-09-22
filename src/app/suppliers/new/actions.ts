'use server';

import { redirect } from 'next/navigation';

import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { enqueuePowerOfficeSync } from '@/lib/jobs';
import { parseMoneyToCents } from '@/lib/money';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

function parsePaymentTermsDays(input: string): number | null {
  if (input === '') {
    return null;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createSupplier(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.SUPPLIER_WRITE);

  const name = String(formData.get('name') ?? '').trim();
  const country = String(formData.get('country') ?? '').trim();
  if (!name || !country) {
    redirect('/suppliers/new?error=missing_fields');
  }

  const supplier = await prisma.supplier.create({
    data: {
      name,
      country,
      email: String(formData.get('email') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      website: String(formData.get('website') ?? '').trim() || null,
      currency: String(formData.get('currency') ?? 'EUR').trim() || 'EUR',
      incoterms: String(formData.get('incoterms') ?? '').trim() || null,
      paymentTermsDays: parsePaymentTermsDays(String(formData.get('paymentTermsDays') ?? '').trim()),
      creditLimitCents: parseMoneyToCents(String(formData.get('creditLimit') ?? '').trim()),
      creditLimitCurrency: String(formData.get('creditLimitCurrency') ?? 'EUR').trim() || 'EUR',
      iban: String(formData.get('iban') ?? '').trim() || null,
      bic: String(formData.get('bic') ?? '').trim() || null,
      createdById: session.id,
    },
  });

  await recordActivity({
    type: 'STATUS',
    text: 'Leverandør opprettet',
    entityType: ENTITY_TYPES.SUPPLIER,
    entityId: supplier.id,
    createdById: session.id,
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: ENTITY_TYPES.SUPPLIER,
    entityId: supplier.id,
    after: { name: supplier.name, country: supplier.country },
  });

  // IN-01: match mot PowerOffice (eller opprett der) skjer i workeren.
  await enqueuePowerOfficeSync({ kind: 'match-supplier', supplierId: supplier.id });

  redirect(`/suppliers/${supplier.id}`);
}
