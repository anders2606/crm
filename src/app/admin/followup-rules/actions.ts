'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FollowUpScope } from '@prisma/client';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

function parseDaysSequence(input: string): number[] {
  return input
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

// OP-05: administrator setter standardregelen og regler per kundegruppe.
export async function saveFollowUpRule(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  const scope = formData.get('scope') as FollowUpScope;
  const customerGroupId = String(formData.get('customerGroupId') ?? '').trim() || null;
  const daysSequence = parseDaysSequence(String(formData.get('daysSequence') ?? ''));
  const templateId = String(formData.get('templateId') ?? '').trim() || null;
  const active = formData.get('active') === 'on';

  if (scope === 'CUSTOMER_GROUP' && !customerGroupId) {
    redirect('/admin/followup-rules?error=missing_group');
  }

  const existing =
    scope === 'DEFAULT'
      ? await prisma.followUpRule.findFirst({ where: { scope: 'DEFAULT' } })
      : await prisma.followUpRule.findUnique({ where: { customerGroupId: customerGroupId! } });

  // Tom dagsekvens for en kundegruppe betyr «bruk standardregelen» – fjern
  // en eventuell eksisterende gruppe-regel i stedet for å lagre en tom en,
  // slik at fallback til standardregelen (OP-05) fungerer som forventet.
  if (scope === 'CUSTOMER_GROUP' && daysSequence.length === 0) {
    if (existing) {
      await prisma.followUpRule.delete({ where: { id: existing.id } });
      await logAudit({
        userId: session.id,
        action: 'delete',
        entityType: 'FollowUpRule',
        entityId: existing.id,
        before: { scope, customerGroupId },
      });
    }
    revalidatePath('/admin/followup-rules');
    return;
  }

  if (existing) {
    await prisma.followUpRule.update({
      where: { id: existing.id },
      data: { daysSequence, templateId, active },
    });
  } else {
    await prisma.followUpRule.create({
      data: { scope, customerGroupId: scope === 'CUSTOMER_GROUP' ? customerGroupId : null, daysSequence, templateId, active, createdById: session.id },
    });
  }

  await logAudit({
    userId: session.id,
    action: existing ? 'update' : 'create',
    entityType: 'FollowUpRule',
    entityId: existing?.id ?? 'ny',
    after: { scope, customerGroupId, daysSequence, templateId, active },
  });

  revalidatePath('/admin/followup-rules');
}
