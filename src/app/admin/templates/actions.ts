'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { TemplateStatus, TemplateType } from '@prisma/client';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { createTemplateVersion } from '@/modules/templates/service';

function requireTemplateManage() {
  return requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
}

function readTemplateFields(formData: FormData) {
  return {
    type: formData.get('type') as TemplateType,
    name: String(formData.get('name') ?? '').trim(),
    language: String(formData.get('language') ?? 'nb').trim() || 'nb',
    customerGroupId: String(formData.get('customerGroupId') ?? '').trim() || null,
    subject: String(formData.get('subject') ?? '').trim() || null,
    content: String(formData.get('content') ?? ''),
    status: (formData.get('status') === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT') as TemplateStatus,
    comment: String(formData.get('comment') ?? '').trim() || null,
  };
}

// SD-02: administrator oppretter maler i systemet uten hjelp fra utvikler.
export async function createTemplate(formData: FormData): Promise<void> {
  const session = await requireTemplateManage();
  const fields = readTemplateFields(formData);

  if (!fields.name || !fields.type || !fields.content) {
    redirect('/admin/templates/new?error=missing_fields');
  }

  const template = await createTemplateVersion({ ...fields, userId: session.id });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'Template',
    entityId: template.id,
    after: { name: template.name, type: template.type, status: template.status },
  });

  revalidatePath('/admin/templates');
  redirect(`/admin/templates/${template.groupId}`);
}

// SD-03: en endring lagres alltid som en ny versjon – den forrige beholdes og
// kan fortsatt åpnes/gjenopprettes, den blir bare ikke lenger `isCurrent`.
export async function createTemplateNewVersion(formData: FormData): Promise<void> {
  const session = await requireTemplateManage();
  const replacesTemplateId = String(formData.get('replacesTemplateId') ?? '');
  const fields = readTemplateFields(formData);

  if (!fields.name || !fields.content) {
    redirect(`/admin/templates/${formData.get('groupId')}?error=missing_fields`);
  }

  const template = await createTemplateVersion({ ...fields, replacesTemplateId, userId: session.id });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'Template',
    entityId: template.id,
    after: { name: template.name, version: template.version, status: template.status },
  });

  revalidatePath(`/admin/templates/${template.groupId}`);
}

// SD-03: gjenoppretter en tidligere versjon ved å lagre innholdet dens som en
// ny, gjeldende versjon (historikken – inkludert den forrige gjeldende
// versjonen – beholdes uendret).
export async function restoreTemplateVersion(formData: FormData): Promise<void> {
  const session = await requireTemplateManage();
  const versionId = String(formData.get('versionId') ?? '');

  const old = await prisma.template.findUniqueOrThrow({ where: { id: versionId } });
  const current = await prisma.template.findFirstOrThrow({ where: { groupId: old.groupId, isCurrent: true } });

  const template = await createTemplateVersion({
    replacesTemplateId: current.id,
    type: old.type,
    name: old.name,
    language: old.language,
    customerGroupId: old.customerGroupId,
    subject: old.subject,
    content: old.content,
    status: old.status,
    comment: `Gjenopprettet fra versjon ${old.version}`,
    userId: session.id,
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'Template',
    entityId: template.id,
    after: { restoredFromVersion: old.version },
  });

  revalidatePath(`/admin/templates/${template.groupId}`);
}
