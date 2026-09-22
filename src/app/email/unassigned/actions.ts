'use server';

import { revalidatePath } from 'next/cache';

import { ENTITY_TYPES } from '@/lib/entity-types';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { assignMessageToEntity } from '@/modules/email/assignment';

export async function assignToCustomer(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.CUSTOMER_WRITE);
  const messageId = String(formData.get('messageId') ?? '');
  const customerId = String(formData.get('customerId') ?? '');
  if (!customerId) {
    return;
  }

  await assignMessageToEntity(messageId, ENTITY_TYPES.CUSTOMER, customerId, session.id);
  revalidatePath('/email/unassigned');
}

export async function assignToSupplier(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.SUPPLIER_WRITE);
  const messageId = String(formData.get('messageId') ?? '');
  const supplierId = String(formData.get('supplierId') ?? '');
  if (!supplierId) {
    return;
  }

  await assignMessageToEntity(messageId, ENTITY_TYPES.SUPPLIER, supplierId, session.id);
  revalidatePath('/email/unassigned');
}
