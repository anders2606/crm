'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { encryptSecret } from '@/lib/secrets';

function parsePort(value: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// EP-03: administrator oppretter en e-postkonto – personlig (eier én bruker)
// eller felles (post@/ordre@, tilgang styrt av roller).
export async function createEmailAccount(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.EMAIL_ACCOUNTS_MANAGE);

  const address = String(formData.get('address') ?? '').trim().toLowerCase();
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const imapHost = String(formData.get('imapHost') ?? '').trim();
  const imapPort = parsePort(formData.get('imapPort'), 993);
  const smtpHost = String(formData.get('smtpHost') ?? '').trim();
  const smtpPort = parsePort(formData.get('smtpPort'), 465);
  const shared = formData.get('shared') === '1';
  const ownerUserId = !shared ? String(formData.get('ownerUserId') ?? '').trim() || null : null;
  const roleIds = formData.getAll('roleIds').map(String);

  if (!address || !username || !password || !imapHost || !smtpHost) {
    return;
  }

  const account = await prisma.emailAccount.create({
    data: {
      address,
      username,
      encryptedPassword: encryptSecret(password),
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
      shared,
      ownerUserId,
      // EP-01: synk starter fra datoen kontoen legges til – eldre e-post hentes ikke.
      syncFromDate: new Date(),
      createdById: session.id,
      ...(shared && roleIds.length > 0
        ? { accessRoles: { create: roleIds.map((roleId) => ({ roleId })) } }
        : {}),
    },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'EmailAccount',
    entityId: account.id,
    after: { address: account.address, shared: account.shared },
  });

  revalidatePath('/email/accounts');
}

export async function deactivateEmailAccount(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.EMAIL_ACCOUNTS_MANAGE);
  const accountId = String(formData.get('accountId') ?? '');

  await prisma.emailAccount.update({ where: { id: accountId }, data: { active: false } });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'EmailAccount',
    entityId: accountId,
    after: { active: false },
  });

  revalidatePath('/email/accounts');
}
