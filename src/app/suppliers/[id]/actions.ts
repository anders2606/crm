'use server';

import { revalidatePath } from 'next/cache';
import type { DocumentCategory } from '@prisma/client';

import { redirect } from 'next/navigation';

import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { enqueuePowerOfficeInvoiceForward } from '@/lib/jobs';
import { prisma } from '@/lib/db';
import { parseMoneyToCents } from '@/lib/money';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { DOCUMENT_CATEGORY_LABELS, saveDocumentUpload } from '@/modules/documents/service';
import { getAccessibleEmailAccounts } from '@/modules/email/access';

const ADDRESS_TYPES = ['VISIT', 'INVOICE', 'DELIVERY'] as const;
type AddressTypeInput = (typeof ADDRESS_TYPES)[number];
function parseAddressType(value: FormDataEntryValue | null): AddressTypeInput {
  return (ADDRESS_TYPES as readonly string[]).includes(String(value))
    ? (value as AddressTypeInput)
    : 'VISIT';
}

const ACTIVITY_TYPES = ['NOTE', 'CALL', 'MEETING'] as const;
type ActivityTypeInput = (typeof ACTIVITY_TYPES)[number];
function parseActivityType(value: FormDataEntryValue | null): ActivityTypeInput {
  return (ACTIVITY_TYPES as readonly string[]).includes(String(value))
    ? (value as ActivityTypeInput)
    : 'NOTE';
}

function requireSupplierWrite() {
  return requirePermission(PERMISSIONS.SUPPLIER_WRITE);
}

function parsePaymentTermsDays(input: string): number | null {
  if (input === '') {
    return null;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateSupplier(formData: FormData): Promise<void> {
  const session = await requireSupplierWrite();
  const supplierId = String(formData.get('supplierId') ?? '');

  const before = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });

  const name = String(formData.get('name') ?? '').trim();
  const country = String(formData.get('country') ?? '').trim();

  const after = await prisma.supplier.update({
    where: { id: supplierId },
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
    },
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: ENTITY_TYPES.SUPPLIER,
    entityId: supplierId,
    before: { name: before.name, country: before.country, email: before.email },
    after: { name: after.name, country: after.country, email: after.email },
  });

  revalidatePath(`/suppliers/${supplierId}`);
}

export async function addContactPerson(formData: FormData): Promise<void> {
  const session = await requireSupplierWrite();
  const supplierId = String(formData.get('supplierId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    return;
  }

  const contact = await prisma.contactPerson.create({
    data: {
      supplierId,
      name,
      role: String(formData.get('role') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      language: String(formData.get('language') ?? '').trim() || 'nb',
      createdById: session.id,
    },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'ContactPerson',
    entityId: contact.id,
    after: { name: contact.name, supplierId },
  });

  revalidatePath(`/suppliers/${supplierId}`);
}

export async function addAddress(formData: FormData): Promise<void> {
  await requireSupplierWrite();
  const supplierId = String(formData.get('supplierId') ?? '');
  const street = String(formData.get('street') ?? '').trim();
  const postalCode = String(formData.get('postalCode') ?? '').trim();
  const city = String(formData.get('city') ?? '').trim();
  if (!street || !postalCode || !city) {
    return;
  }

  await prisma.address.create({
    data: {
      supplierId,
      type: parseAddressType(formData.get('type')),
      street,
      postalCode,
      city,
      country: String(formData.get('country') ?? '').trim() || 'NO',
    },
  });

  revalidatePath(`/suppliers/${supplierId}`);
}

export async function addActivity(formData: FormData): Promise<void> {
  const session = await requireSupplierWrite();
  const supplierId = String(formData.get('supplierId') ?? '');
  const text = String(formData.get('text') ?? '').trim();
  if (!text) {
    return;
  }

  await recordActivity({
    type: parseActivityType(formData.get('type')),
    text,
    entityType: ENTITY_TYPES.SUPPLIER,
    entityId: supplierId,
    createdById: session.id,
  });

  revalidatePath(`/suppliers/${supplierId}`);
}

export async function createTask(formData: FormData): Promise<void> {
  const session = await requireSupplierWrite();
  const supplierId = String(formData.get('supplierId') ?? '');
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
      entityType: ENTITY_TYPES.SUPPLIER,
      entityId: supplierId,
      createdById: session.id,
    },
  });

  revalidatePath(`/suppliers/${supplierId}`);
}

export async function completeTask(formData: FormData): Promise<void> {
  await requireSupplierWrite();
  const taskId = String(formData.get('taskId') ?? '');
  const supplierId = String(formData.get('supplierId') ?? '');

  await prisma.task.update({ where: { id: taskId }, data: { status: 'DONE' } });

  revalidatePath(`/suppliers/${supplierId}`);
}

// DO-01/DO-02/DO-04/DO-05: opplasting (ny eller ny versjon av et eksisterende dokument).
export async function uploadDocument(formData: FormData): Promise<void> {
  const session = await requireSupplierWrite();
  const supplierId = String(formData.get('supplierId') ?? '');
  const file = formData.get('file');
  const category = String(formData.get('category') ?? 'OTHER') as DocumentCategory;
  const replacesDocumentId = String(formData.get('replacesDocumentId') ?? '') || null;

  if (!(file instanceof File) || file.size === 0) {
    return;
  }

  const document = await saveDocumentUpload({
    entityType: ENTITY_TYPES.SUPPLIER,
    entityId: supplierId,
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
    entityType: ENTITY_TYPES.SUPPLIER,
    entityId: supplierId,
    createdById: session.id,
  });

  await logAudit({
    userId: session.id,
    action: replacesDocumentId ? 'update' : 'create',
    entityType: 'Document',
    entityId: document.id,
    after: { fileName: document.fileName, category: document.category, version: document.version },
  });

  revalidatePath(`/suppliers/${supplierId}`);
}

// IN-04: manuell opplasting av en leverandørfaktura (PDF), som deretter
// videresendes til PowerOffice sitt fakturamottak. Selve SMTP-kallet skjer
// kun i workeren (arbeidsregel 12, se src/modules/poweroffice/invoice-forward.ts).
export async function uploadSupplierInvoiceToPowerOffice(formData: FormData): Promise<void> {
  const session = await requireSupplierWrite();
  const supplierId = String(formData.get('supplierId') ?? '');
  const emailAccountId = String(formData.get('emailAccountId') ?? '');
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0 || file.type !== 'application/pdf') {
    redirect(`/suppliers/${supplierId}?error=invoice_must_be_pdf`);
  }

  const accessibleAccounts = await getAccessibleEmailAccounts(session.id);
  if (!accessibleAccounts.some((account) => account.id === emailAccountId)) {
    redirect(`/suppliers/${supplierId}?error=cannot_send_invoice`);
  }

  const document = await saveDocumentUpload({
    entityType: ENTITY_TYPES.SUPPLIER,
    entityId: supplierId,
    category: 'INVOICE',
    file,
    userId: session.id,
  });

  await enqueuePowerOfficeInvoiceForward({
    documentId: document.id,
    supplierId,
    emailAccountId,
    userId: session.id,
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'Document',
    entityId: document.id,
    after: { fileName: document.fileName, category: document.category, queuedForPowerOffice: true },
  });

  revalidatePath(`/suppliers/${supplierId}`);
}
