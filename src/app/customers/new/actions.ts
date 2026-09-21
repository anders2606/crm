'use server';

import { redirect } from 'next/navigation';
import type { CustomerType } from '@prisma/client';

import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { parseMoneyToCents } from '@/lib/money';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { findPotentialDuplicateCustomers } from '@/modules/customers/duplicate-check';

function buildQuery(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

export async function createCustomer(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.CUSTOMER_WRITE);

  const type = formData.get('type') === 'PRIVATE' ? 'PRIVATE' : 'COMPANY';
  const name = String(formData.get('name') ?? '').trim();
  const orgNr = String(formData.get('orgNr') ?? '').trim() || null;
  const email = String(formData.get('email') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const creditLimitInput = String(formData.get('creditLimit') ?? '').trim();
  const creditLimitCurrency = String(formData.get('creditLimitCurrency') ?? 'NOK').trim() || 'NOK';
  const paymentTermsDaysInput = String(formData.get('paymentTermsDays') ?? '').trim();
  const confirmDuplicate = formData.get('confirmDuplicate') === '1';

  const fieldsForRedirect = {
    type,
    name,
    orgNr: orgNr ?? '',
    email: email ?? '',
    phone: phone ?? '',
    creditLimit: creditLimitInput,
    creditLimitCurrency,
    paymentTermsDays: paymentTermsDaysInput,
  };

  if (!name) {
    redirect(`/customers/new?${buildQuery({ ...fieldsForRedirect, error: 'missing_name' })}`);
  }

  // KU-10: gi duplikatvarsel før opprettelse, med mindre selgeren allerede har bekreftet.
  if (!confirmDuplicate) {
    const duplicates = await findPotentialDuplicateCustomers({ name, email, orgNr });
    if (duplicates.length > 0) {
      redirect(`/customers/new?${buildQuery({ ...fieldsForRedirect, duplicate: '1' })}`);
    }
  }

  let paymentTermsDays: number | null = null;
  if (paymentTermsDaysInput !== '') {
    const parsed = Number(paymentTermsDaysInput);
    paymentTermsDays = Number.isFinite(parsed) ? parsed : null;
  }

  const customer = await prisma.customer.create({
    data: {
      type: type as CustomerType,
      name,
      orgNr,
      email,
      phone,
      creditLimitCents: parseMoneyToCents(creditLimitInput),
      creditLimitCurrency,
      paymentTermsDays,
      createdById: session.id,
    },
  });

  await recordActivity({
    type: 'STATUS',
    text: 'Kunde opprettet',
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customer.id,
    createdById: session.id,
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customer.id,
    after: { name: customer.name, type: customer.type, orgNr: customer.orgNr, email: customer.email },
  });

  redirect(`/customers/${customer.id}`);
}
