// GR-01/02/04/05: opprettelse og "frysing" av en kampanje. Selve SMTP-kallet
// for hver mottaker skjer kun i workeren (arbeidsregel 12,
// src/modules/campaigns/send.ts) – denne modulen kun forbereder og lagrer.
import type { EmailCampaign, EmailCampaignRecipientStatus, EmailCampaignStatus } from '@prisma/client';

import { prisma } from '@/lib/db';

import { resolveCampaignRecipientCustomerIds } from './segment';

export const EMAIL_CAMPAIGN_STATUS_LABELS: Record<EmailCampaignStatus, string> = {
  DRAFT: 'Kladd',
  SCHEDULED: 'Planlagt',
  SENDING: 'Sender',
  COMPLETED: 'Fullført',
  CANCELLED: 'Kansellert',
};

export const EMAIL_CAMPAIGN_RECIPIENT_STATUS_LABELS: Record<EmailCampaignRecipientStatus, string> = {
  QUEUED: 'I kø',
  SENT: 'Sendt',
  BOUNCED: 'Returnert',
  UNSUBSCRIBED: 'Avmeldt',
  SKIPPED: 'Hoppet over',
};

export interface CreateCampaignInput {
  name: string;
  templateId: string;
  emailAccountId: string;
  customerGroupIds: string[];
  filterPurchasedWithinDays: number | null;
  filterCountry: string | null;
  filterMaterialId: string | null;
  scheduledAt: Date | null;
  userId: string | null;
}

export async function createCampaign(input: CreateCampaignInput): Promise<EmailCampaign> {
  return prisma.emailCampaign.create({
    data: {
      name: input.name,
      templateId: input.templateId,
      emailAccountId: input.emailAccountId,
      customerGroupIds: input.customerGroupIds,
      filterPurchasedWithinDays: input.filterPurchasedWithinDays,
      filterCountry: input.filterCountry,
      filterMaterialId: input.filterMaterialId,
      scheduledAt: input.scheduledAt,
      // Alltid DRAFT ved opprettelse, uansett scheduledAt – mottakerlisten
      // løses først ut (og status blir SCHEDULED/SENDING) når administrator
      // eksplisitt legger kampanjen i kø, se queueCampaignForSending.
      status: 'DRAFT',
      createdById: input.userId,
    },
  });
}

/**
 * GR-01: løser ut mottakerlisten NÅ og fryser den – en senere endring i
 * kundegrupper/filtre påvirker aldri en kampanje som allerede er lagt i
 * sendekø (samme frysingsprinsipp som Quote.termsSnapshot, SD-04).
 * Kalles når administrator går fra kladd til faktisk (planlagt) utsendelse.
 */
export async function queueCampaignForSending(campaignId: string): Promise<number> {
  const campaign = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.status !== 'DRAFT') {
    throw new Error(`Kampanjen har allerede status ${campaign.status} – kan ikke legges i kø på nytt.`);
  }

  const customerIds = await resolveCampaignRecipientCustomerIds({
    customerGroupIds: campaign.customerGroupIds,
    filterPurchasedWithinDays: campaign.filterPurchasedWithinDays,
    filterCountry: campaign.filterCountry,
    filterMaterialId: campaign.filterMaterialId,
  });

  await prisma.$transaction([
    prisma.emailCampaignRecipient.deleteMany({ where: { campaignId } }),
    prisma.emailCampaignRecipient.createMany({
      data: customerIds.map((customerId) => ({ campaignId, customerId, status: 'QUEUED' as const })),
    }),
    prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: campaign.scheduledAt && campaign.scheduledAt > new Date() ? 'SCHEDULED' : 'SENDING' },
    }),
  ]);

  return customerIds.length;
}
