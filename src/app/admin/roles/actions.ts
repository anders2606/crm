'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit/log';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

export async function createRole(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.ADMIN_ROLES_MANAGE);

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const permissionIds = formData.getAll('permissionIds').map(String);

  if (!name) {
    redirect('/admin/roles?error=missing_name');
  }

  const role = await prisma.role.create({
    data: {
      name,
      description,
      createdById: session.id,
      permissions: {
        create: permissionIds.map((permissionId) => ({ permissionId })),
      },
    },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'Role',
    entityId: role.id,
    after: { name: role.name, description: role.description, permissionIds },
  });

  revalidatePath('/admin/roles');
}

export async function updateRolePermissions(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.ADMIN_ROLES_MANAGE);
  const roleId = String(formData.get('roleId') ?? '');
  const permissionIds = formData.getAll('permissionIds').map(String);

  const before = await prisma.role.findUniqueOrThrow({
    where: { id: roleId },
    include: { permissions: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    }
    await logAudit(
      {
        userId: session.id,
        action: 'update',
        entityType: 'Role',
        entityId: roleId,
        before: { permissionIds: before.permissions.map((rolePermission) => rolePermission.permissionId) },
        after: { permissionIds },
      },
      tx,
    );
  });

  revalidatePath('/admin/roles');
}
