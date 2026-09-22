'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { DocumentCategory, MaterialAvailability, MaterialFinish, MaterialType } from '@prisma/client';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { parseMoneyToCents } from '@/lib/money';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { convertToNok } from '@/modules/exchange-rates/service';
import { saveDocumentUpload } from '@/modules/documents/service';

function parseIntList(input: string): number[] {
  return input
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parseStringList(input: string): string[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function requireMaterialWrite() {
  return requirePermission(PERMISSIONS.MATERIAL_WRITE);
}

export async function updateMaterial(formData: FormData): Promise<void> {
  const session = await requireMaterialWrite();
  const materialId = String(formData.get('materialId') ?? '');

  const before = await prisma.material.findUniqueOrThrow({ where: { id: materialId } });

  const after = await prisma.material.update({
    where: { id: materialId },
    data: {
      name: String(formData.get('name') ?? '').trim(),
      tradeName: String(formData.get('tradeName') ?? '').trim() || null,
      type: (formData.get('type') as MaterialType) ?? before.type,
      origin: String(formData.get('origin') ?? '').trim() || null,
      color: String(formData.get('color') ?? '').trim() || null,
      finish: (String(formData.get('finish') ?? '').trim() || null) as MaterialFinish | null,
      thicknessesMm: parseIntList(String(formData.get('thicknessesMm') ?? '')),
      slabSizes: parseStringList(String(formData.get('slabSizes') ?? '')),
      maintenanceNotes: String(formData.get('maintenanceNotes') ?? '').trim() || null,
      availability: (formData.get('availability') as MaterialAvailability) ?? before.availability,
    },
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'Material',
    entityId: materialId,
    before: { name: before.name, availability: before.availability },
    after: { name: after.name, availability: after.availability },
  });

  revalidatePath(`/materials/${materialId}`);
}

export async function addMaterialSupplier(formData: FormData): Promise<void> {
  await requireMaterialWrite();
  const materialId = String(formData.get('materialId') ?? '');
  const supplierId = String(formData.get('supplierId') ?? '');
  if (!supplierId) {
    return;
  }

  await prisma.materialSupplier.upsert({
    where: { materialId_supplierId: { materialId, supplierId } },
    update: {},
    create: { materialId, supplierId },
  });

  revalidatePath(`/materials/${materialId}`);
}

// MA-03: registrerer en historisk pris. Beløpet regnes om til NOK med
// Norges Bank-kursen for prisdatoen (lest fra tabellen workeren fyller –
// aldri hentet direkte i denne server actionen, arbeidsregel 12).
export async function addPriceEntry(formData: FormData): Promise<void> {
  const session = await requireMaterialWrite();
  const materialId = String(formData.get('materialId') ?? '');
  const type = formData.get('type') === 'SALE' ? 'SALE' : 'PURCHASE';
  const supplierId = String(formData.get('supplierId') ?? '').trim() || null;
  const currency = String(formData.get('currency') ?? 'NOK').trim().toUpperCase() || 'NOK';
  const unit = String(formData.get('unit') ?? 'm²').trim() || 'm²';
  const priceDateInput = String(formData.get('priceDate') ?? '').trim();
  const source = String(formData.get('source') ?? '').trim() || null;
  const amountMinor = parseMoneyToCents(String(formData.get('amount') ?? '').trim());

  if (amountMinor === null || !priceDateInput) {
    redirect(`/materials/${materialId}?error=missing_fields`);
  }

  const priceDate = new Date(priceDateInput);

  const conversion = await convertToNok(amountMinor, currency, priceDate);
  if (!conversion) {
    redirect(`/materials/${materialId}?error=missing_rate`);
  }

  const entry = await prisma.priceEntry.create({
    data: {
      materialId,
      type,
      supplierId: type === 'PURCHASE' ? supplierId : null,
      amountMinor,
      currency,
      amountNokMinor: conversion.amountNokMinor,
      unit,
      priceDate,
      source,
      createdById: session.id,
    },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'PriceEntry',
    entityId: entry.id,
    after: { materialId, type, amountMinor, currency, amountNokMinor: entry.amountNokMinor },
  });

  revalidatePath(`/materials/${materialId}`);
}

export async function uploadMaterialPhoto(formData: FormData): Promise<void> {
  const session = await requireMaterialWrite();
  const materialId = String(formData.get('materialId') ?? '');
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return;
  }

  await saveDocumentUpload({
    entityType: 'Material',
    entityId: materialId,
    category: 'PHOTO' as DocumentCategory,
    file,
    userId: session.id,
  });

  revalidatePath(`/materials/${materialId}`);
}
