'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

export async function createCustomerGroup(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.CUSTOMER_WRITE);
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  if (!name) {
    return;
  }

  const group = await prisma.customerGroup.create({
    data: { name, description, createdById: session.id },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'CustomerGroup',
    entityId: group.id,
    after: { name: group.name, description: group.description },
  });

  revalidatePath('/customers/groups');
  revalidatePath('/customers');
}
