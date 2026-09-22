'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { createTextBlockVersion } from '@/modules/templates/service';

function requireTemplateManage() {
  return requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
}

function readTextBlockFields(formData: FormData) {
  return {
    name: String(formData.get('name') ?? '').trim(),
    language: String(formData.get('language') ?? 'nb').trim() || 'nb',
    content: String(formData.get('content') ?? ''),
    comment: String(formData.get('comment') ?? '').trim() || null,
  };
}

// TO-03: tekstblokker som kan velges inn i tilbud (vedlikeholdsråd, montering, måltaking, ...).
export async function createTextBlock(formData: FormData): Promise<void> {
  const session = await requireTemplateManage();
  const fields = readTextBlockFields(formData);

  if (!fields.name || !fields.content) {
    redirect('/admin/text-blocks/new?error=missing_fields');
  }

  const textBlock = await createTextBlockVersion({ ...fields, userId: session.id });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'TextBlock',
    entityId: textBlock.id,
    after: { name: textBlock.name },
  });

  revalidatePath('/admin/text-blocks');
  redirect(`/admin/text-blocks/${textBlock.groupId}`);
}

export async function createTextBlockNewVersion(formData: FormData): Promise<void> {
  const session = await requireTemplateManage();
  const replacesTextBlockId = String(formData.get('replacesTextBlockId') ?? '');
  const fields = readTextBlockFields(formData);

  if (!fields.name || !fields.content) {
    redirect(`/admin/text-blocks/${formData.get('groupId')}?error=missing_fields`);
  }

  const textBlock = await createTextBlockVersion({ ...fields, replacesTextBlockId, userId: session.id });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'TextBlock',
    entityId: textBlock.id,
    after: { name: textBlock.name, version: textBlock.version },
  });

  revalidatePath(`/admin/text-blocks/${textBlock.groupId}`);
}

export async function restoreTextBlockVersion(formData: FormData): Promise<void> {
  const session = await requireTemplateManage();
  const versionId = String(formData.get('versionId') ?? '');

  const old = await prisma.textBlock.findUniqueOrThrow({ where: { id: versionId } });
  const current = await prisma.textBlock.findFirstOrThrow({ where: { groupId: old.groupId, isCurrent: true } });

  const textBlock = await createTextBlockVersion({
    replacesTextBlockId: current.id,
    name: old.name,
    language: old.language,
    content: old.content,
    comment: `Gjenopprettet fra versjon ${old.version}`,
    userId: session.id,
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'TextBlock',
    entityId: textBlock.id,
    after: { restoredFromVersion: old.version },
  });

  revalidatePath(`/admin/text-blocks/${textBlock.groupId}`);
}
