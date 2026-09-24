'use server';

import { revalidatePath } from 'next/cache';
import type { CustomerType } from '@prisma/client';

import type { DocumentCategory } from '@prisma/client';

import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { parseMoneyToCents } from '@/lib/money';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { DOCUMENT_CATEGORY_LABELS, saveDocumentUpload } from '@/modules/documents/service';

const ADDRESS_TYPES = ['VISIT', 'INVOICE', 'DELIVERY'] as const;
type AddressTypeInput = (typeof ADDRESS_TYPES)[number];
function parseAddressType(value: FormDataEntryValue | null): AddressTypeInput {
  return (ADDRESS_TYPES as readonly string[]).includes(String(value))
    ? (value as AddressTypeInput)
    : 'VISIT';
}

// STATUS/EMAIL settes av systemet selv (opprettelse, e-postsynk i M3), ikke valgbare her.
const ACTIVITY_TYPES = ['NOTE', 'CALL', 'MEETING'] as const;
type ActivityTypeInput = (typeof ACTIVITY_TYPES)[number];
function parseActivityType(value: FormDataEntryValue | null): ActivityTypeInput {
  return (ACTIVITY_TYPES as readonly string[]).includes(String(value))
    ? (value as ActivityTypeInput)
    : 'NOTE';
}

function requireCustomerWrite() {
  return requirePermission(PERMISSIONS.CUSTOMER_WRITE);
}

function parsePaymentTermsDays(input: string): number | null {
  if (input === '') {
    return null;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateCustomer(formData: FormData): Promise<void> {
  const session = await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');

  const before = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

  const type = formData.get('type') === 'PRIVATE' ? 'PRIVATE' : 'COMPANY';
  const name = String(formData.get('name') ?? '').trim();
  const orgNr = String(formData.get('orgNr') ?? '').trim() || null;
  const email = String(formData.get('email') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const creditLimitInput = String(formData.get('creditLimit') ?? '').trim();
  const creditLimitCurrency = String(formData.get('creditLimitCurrency') ?? 'NOK').trim() || 'NOK';
  const paymentTermsDays = parsePaymentTermsDays(String(formData.get('paymentTermsDays') ?? '').trim());

  const after = await prisma.customer.update({
    where: { id: customerId },
    data: {
      type: type as CustomerType,
      name,
      orgNr,
      email,
      phone,
      creditLimitCents: parseMoneyToCents(creditLimitInput),
      creditLimitCurrency,
      paymentTermsDays,
      // GR-07: en rettet e-postadresse skal kunne motta utsendelser igjen.
      ...(email !== before.email ? { emailBounced: false, emailBouncedAt: null } : {}),
    },
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customerId,
    before: {
      name: before.name,
      type: before.type,
      orgNr: before.orgNr,
      email: before.email,
      phone: before.phone,
    },
    after: { name: after.name, type: after.type, orgNr: after.orgNr, email: after.email, phone: after.phone },
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function addContactPerson(formData: FormData): Promise<void> {
  const session = await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    return;
  }

  const contact = await prisma.contactPerson.create({
    data: {
      customerId,
      name,
      role: String(formData.get('role') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      createdById: session.id,
    },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'ContactPerson',
    entityId: contact.id,
    after: { name: contact.name, customerId },
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function addAddress(formData: FormData): Promise<void> {
  await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');
  const street = String(formData.get('street') ?? '').trim();
  const postalCode = String(formData.get('postalCode') ?? '').trim();
  const city = String(formData.get('city') ?? '').trim();
  if (!street || !postalCode || !city) {
    return;
  }

  await prisma.address.create({
    data: {
      customerId,
      type: parseAddressType(formData.get('type')),
      street,
      postalCode,
      city,
      country: String(formData.get('country') ?? 'NO').trim() || 'NO',
    },
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function setCustomerGroups(formData: FormData): Promise<void> {
  await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');
  const groupIds = formData.getAll('groupIds').map(String);

  await prisma.customer.update({
    where: { id: customerId },
    data: { groups: { set: groupIds.map((id) => ({ id })) } },
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function addConsent(formData: FormData): Promise<void> {
  const session = await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');
  const channel = String(formData.get('channel') ?? '').trim();
  const status = formData.get('status') === 'WITHDRAWN' ? 'WITHDRAWN' : 'GIVEN';
  const source = String(formData.get('source') ?? '').trim() || null;
  if (!channel) {
    return;
  }

  await prisma.consent.create({
    data: { customerId, channel, status, source, createdById: session.id },
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function addActivity(formData: FormData): Promise<void> {
  const session = await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');
  const text = String(formData.get('text') ?? '').trim();
  if (!text) {
    return;
  }

  await recordActivity({
    type: parseActivityType(formData.get('type')),
    text,
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customerId,
    createdById: session.id,
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function createTask(formData: FormData): Promise<void> {
  const session = await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const dueAtInput = String(formData.get('dueAt') ?? '').trim();
  if (!title) {
    return;
  }

  await prisma.task.create({
    data: {
      title,
      dueAt: dueAtInput ? new Date(dueAtInput) : null,
      assigneeId: session.id,
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: customerId,
      createdById: session.id,
    },
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function completeTask(formData: FormData): Promise<void> {
  await requireCustomerWrite();
  const taskId = String(formData.get('taskId') ?? '');
  const customerId = String(formData.get('customerId') ?? '');

  await prisma.task.update({ where: { id: taskId }, data: { status: 'DONE' } });

  revalidatePath(`/customers/${customerId}`);
}

// DO-01/DO-02/DO-04/DO-05: opplasting (ny eller ny versjon av et eksisterende dokument).
export async function uploadDocument(formData: FormData): Promise<void> {
  const session = await requireCustomerWrite();
  const customerId = String(formData.get('customerId') ?? '');
  const file = formData.get('file');
  const category = String(formData.get('category') ?? 'OTHER') as DocumentCategory;
  const replacesDocumentId = String(formData.get('replacesDocumentId') ?? '') || null;

  if (!(file instanceof File) || file.size === 0) {
    return;
  }

  const document = await saveDocumentUpload({
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customerId,
    category,
    file,
    replacesDocumentId,
    userId: session.id,
  });

  await recordActivity({
    type: 'STATUS',
    text: replacesDocumentId
      ? `Ny versjon lastet opp: ${document.fileName} (v${document.version})`
      : `Dokument lastet opp: ${document.fileName} (${DOCUMENT_CATEGORY_LABELS[document.category]})`,
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customerId,
    createdById: session.id,
  });

  await logAudit({
    userId: session.id,
    action: replacesDocumentId ? 'update' : 'create',
    entityType: 'Document',
    entityId: document.id,
    after: { fileName: document.fileName, category: document.category, version: document.version },
  });

  revalidatePath(`/customers/${customerId}`);
}

function parseDaysSequence(input: string): number[] {
  return input
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

// OP-05: oppfølgingsregelen kan overstyres per kunde.
export async function setCustomerFollowUpRule(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.CUSTOMER_WRITE);
  const customerId = String(formData.get('customerId') ?? '');
  const daysSequence = parseDaysSequence(String(formData.get('daysSequence') ?? ''));
  const active = formData.get('active') === 'on';

  const existing = await prisma.followUpRule.findUnique({ where: { customerId } });

  if (daysSequence.length === 0) {
    if (existing) {
      await prisma.followUpRule.delete({ where: { id: existing.id } });
    }
    revalidatePath(`/customers/${customerId}`);
    return;
  }

  if (existing) {
    await prisma.followUpRule.update({ where: { id: existing.id }, data: { daysSequence, active } });
  } else {
    await prisma.followUpRule.create({
      data: { scope: 'CUSTOMER', customerId, daysSequence, active, createdById: session.id },
    });
  }

  await logAudit({
    userId: session.id,
    action: existing ? 'update' : 'create',
    entityType: 'FollowUpRule',
    entityId: existing?.id ?? 'ny',
    after: { customerId, daysSequence, active },
  });

  revalidatePath(`/customers/${customerId}`);
}
