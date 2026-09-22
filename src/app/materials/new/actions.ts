'use server';

import { redirect } from 'next/navigation';
import type { MaterialAvailability, MaterialFinish, MaterialType } from '@prisma/client';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

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

export async function createMaterial(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.MATERIAL_WRITE);

  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    redirect('/materials/new?error=missing_name');
  }

  const material = await prisma.material.create({
    data: {
      name,
      tradeName: String(formData.get('tradeName') ?? '').trim() || null,
      type: (formData.get('type') as MaterialType) ?? 'OTHER',
      origin: String(formData.get('origin') ?? '').trim() || null,
      color: String(formData.get('color') ?? '').trim() || null,
      finish: (String(formData.get('finish') ?? '').trim() || null) as MaterialFinish | null,
      thicknessesMm: parseIntList(String(formData.get('thicknessesMm') ?? '')),
      slabSizes: parseStringList(String(formData.get('slabSizes') ?? '')),
      maintenanceNotes: String(formData.get('maintenanceNotes') ?? '').trim() || null,
      availability: (formData.get('availability') as MaterialAvailability) ?? 'AVAILABLE',
      createdById: session.id,
    },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'Material',
    entityId: material.id,
    after: { name: material.name, type: material.type },
  });

  redirect(`/materials/${material.id}`);
}
