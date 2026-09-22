'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { OrderStatus } from '@prisma/client';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

const VALID_STATUSES: OrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION', 'DELIVERED', 'CANCELLED'];

export async function setOrderStatus(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.ORDER_WRITE);
  const orderId = String(formData.get('orderId') ?? '');
  const status = formData.get('status') as OrderStatus;

  if (!VALID_STATUSES.includes(status)) {
    redirect(`/orders/${orderId}?error=invalid_status`);
  }

  const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  await prisma.order.update({ where: { id: orderId }, data: { status } });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: ENTITY_TYPES.ORDER,
    entityId: orderId,
    before: { status: before.status },
    after: { status },
  });

  revalidatePath(`/orders/${orderId}`);
}
