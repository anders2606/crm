'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { createCampaign, queueCampaignForSending } from '@/modules/campaigns/service';

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// GR-01/04: oppretter en kampanje som kladd. Mottakerlisten løses ikke ut
// før administrator eksplisitt legger den i sendekø (queueCampaign under).
export async function createCampaignAction(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.CAMPAIGN_MANAGE);

  const name = String(formData.get('name') ?? '').trim();
  const templateId = String(formData.get('templateId') ?? '');
  const emailAccountId = String(formData.get('emailAccountId') ?? '');
  const customerGroupIds = formData.getAll('customerGroupIds').map(String);
  const filterPurchasedWithinDays = parseOptionalInt(formData.get('filterPurchasedWithinDays'));
  const filterCountry = parseOptionalString(formData.get('filterCountry'));
  const filterMaterialId = parseOptionalString(formData.get('filterMaterialId'));
  const scheduledAtInput = String(formData.get('scheduledAt') ?? '').trim();

  if (!name || !templateId || !emailAccountId) {
    redirect('/admin/campaigns/new?error=missing_fields');
  }

  const campaign = await createCampaign({
    name,
    templateId,
    emailAccountId,
    customerGroupIds,
    filterPurchasedWithinDays,
    filterCountry,
    filterMaterialId,
    scheduledAt: scheduledAtInput ? new Date(scheduledAtInput) : null,
    userId: session.id,
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'EmailCampaign',
    entityId: campaign.id,
    after: { name: campaign.name, status: campaign.status },
  });

  redirect(`/admin/campaigns/${campaign.id}`);
}

// GR-01: fryser mottakerlisten og legger kampanjen i sendekø. Selve SMTP-
// kallene skjer kun i workeren (arbeidsregel 12).
export async function queueCampaignAction(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.CAMPAIGN_MANAGE);
  const campaignId = String(formData.get('campaignId') ?? '');

  const recipientCount = await queueCampaignForSending(campaignId);

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'EmailCampaign',
    entityId: campaignId,
    after: { queuedForSending: true, recipientCount },
  });

  revalidatePath(`/admin/campaigns/${campaignId}`);
}

// GR-07: konfigurerbar fartsgrense per time, felles for alle kampanjer.
export async function updateCampaignSettingsAction(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.CAMPAIGN_MANAGE);
  const hourlyRateLimit = Number(formData.get('hourlyRateLimit'));

  if (!Number.isFinite(hourlyRateLimit) || hourlyRateLimit < 1) {
    redirect('/admin/campaigns?error=invalid_rate_limit');
  }

  await prisma.campaignSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', hourlyRateLimit, updatedById: session.id },
    update: { hourlyRateLimit, updatedById: session.id },
  });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'CampaignSettings',
    entityId: 'singleton',
    after: { hourlyRateLimit },
  });

  revalidatePath('/admin/campaigns');
}
