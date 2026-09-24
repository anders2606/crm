// GR-05/GR-07: selve utsendelsen av kampanje-e-post skjer KUN i workeren
// (arbeidsregel 12). Fartsgrensen er global per time (CampaignSettings.
// hourlyRateLimit), siden SMTP-gjennomstrømningen hos Domeneshop er en delt
// ressurs uavhengig av hvilken konto/kampanje som sender. Funksjonen er en
// ren spørring mot QUEUED-rader hver kjøring – ingen tilstand holdes i
// minnet, så en pause eller omstart av workeren krever ingen egen
// gjenopptakingslogikk (GR-07): neste periodiske kjøring plukker rett opp
// igjen der den sist var.
import type { Customer } from '@prisma/client';

import { recordActivity } from '@/lib/activity';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { getMailClient } from '@/integrations/mail';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/secrets';

import { applyMergeFields } from './merge-fields';

const DEFAULT_HOURLY_RATE_LIMIT = 50;

async function getHourlyRateLimit(): Promise<number> {
  const settings = await prisma.campaignSettings.findUnique({ where: { id: 'singleton' } });
  return settings?.hourlyRateLimit ?? DEFAULT_HOURLY_RATE_LIMIT;
}

async function countSentInLastHour(now: Date): Promise<number> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  return prisma.emailCampaignRecipient.count({ where: { status: 'SENT', sentAt: { gte: since } } });
}

/** GR-05: flytter planlagte kampanjer til sending når tidspunktet er passert. */
async function promoteScheduledCampaigns(now: Date): Promise<void> {
  await prisma.emailCampaign.updateMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    data: { status: 'SENDING' },
  });
}

function resolveMergeFieldValues(
  customer: Pick<Customer, 'type' | 'name'> & { contactPersons: { name: string }[] },
): { navn: string; firma: string; kontaktperson: string } {
  if (customer.type === 'COMPANY') {
    const kontaktperson = customer.contactPersons[0]?.name ?? '';
    return { navn: kontaktperson || customer.name, firma: customer.name, kontaktperson };
  }
  return { navn: customer.name, firma: '', kontaktperson: '' };
}

/**
 * Sender én kampanje-e-post. Feil ved sending (f.eks. ugyldig adresse hos
 * mottakerserveren) markeres SKIPPED med feilmelding i stedet for å bli
 * liggende i QUEUED for evig retry – samme tilnærming som bankfilimportens
 * heuristikk (M7): et forsøk, deretter synlig for manuell oppfølging.
 */
async function sendCampaignEmail(recipientId: string): Promise<void> {
  const recipient = await prisma.emailCampaignRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    include: {
      customer: { include: { contactPersons: true } },
      campaign: { include: { template: true, emailAccount: true } },
    },
  });

  if (!recipient.customer.email) {
    await prisma.emailCampaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'SKIPPED', errorMessage: 'Kunde mangler e-postadresse' },
    });
    return;
  }

  const mergeValues = resolveMergeFieldValues(recipient.customer);
  const subject = applyMergeFields(recipient.campaign.template.subject ?? recipient.campaign.name, mergeValues);
  const senderAddress = recipient.campaign.emailAccount.address;
  // GR-03: avmelding skjer via e-post – mailto-lenke i headeren for
  // e-postklienter som støtter den, og en tekstlig instruksjon for alle
  // andre. Selve avmeldingen registreres når svaret fanges opp av
  // e-postsynken (se handleUnsubscribeReply i sync.ts).
  const text = `${applyMergeFields(recipient.campaign.template.content, mergeValues)}\n\n---\nSvar AVMELD for å melde deg av dette nyhetsbrevet.`;

  try {
    const client = getMailClient();
    await client.sendAndArchive(
      {
        address: senderAddress,
        username: recipient.campaign.emailAccount.username,
        password: decryptSecret(recipient.campaign.emailAccount.encryptedPassword),
        imapHost: recipient.campaign.emailAccount.imapHost,
        imapPort: recipient.campaign.emailAccount.imapPort,
        smtpHost: recipient.campaign.emailAccount.smtpHost,
        smtpPort: recipient.campaign.emailAccount.smtpPort,
      },
      {
        to: [recipient.customer.email],
        subject,
        text,
        headers: { 'List-Unsubscribe': `<mailto:${senderAddress}?subject=AVMELD>` },
      },
    );

    await prisma.emailCampaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'SENT', sentAt: new Date() },
    });

    // GR-06: utsendelsen logges på mottakerens tidslinje.
    await recordActivity({
      type: 'EMAIL',
      text: `Nyhetsbrev «${recipient.campaign.name}» sendt`,
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: recipient.customerId,
      createdById: null,
    });
  } catch (error) {
    await prisma.emailCampaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'SKIPPED', errorMessage: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function completeFinishedCampaigns(now: Date): Promise<void> {
  const sendingCampaigns = await prisma.emailCampaign.findMany({
    where: { status: 'SENDING' },
    select: { id: true },
  });

  for (const campaign of sendingCampaigns) {
    const remainingQueued = await prisma.emailCampaignRecipient.count({
      where: { campaignId: campaign.id, status: 'QUEUED' },
    });
    if (remainingQueued === 0) {
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED', sentAt: now },
      });
    }
  }
}

/**
 * GR-05/GR-07: kjøres periodisk fra workeren (se src/worker/index.ts).
 * Flytter planlagte kampanjer til sending, sender så mange køede mottakere
 * som fartsgrensen for inneværende time tillater, og markerer kampanjer som
 * fullført når mottakerlisten er tom. Returnerer antall forsøkte utsendelser
 * i denne kjøringen (for logging).
 */
export async function processCampaignSendingQueue(now = new Date()): Promise<number> {
  await promoteScheduledCampaigns(now);

  const hourlyRateLimit = await getHourlyRateLimit();
  const sentInLastHour = await countSentInLastHour(now);
  const remainingQuota = Math.max(0, hourlyRateLimit - sentInLastHour);

  let attempted = 0;
  if (remainingQuota > 0) {
    const queued = await prisma.emailCampaignRecipient.findMany({
      where: { status: 'QUEUED', campaign: { status: 'SENDING' } },
      orderBy: { createdAt: 'asc' },
      take: remainingQuota,
      select: { id: true },
    });

    for (const recipient of queued) {
      await sendCampaignEmail(recipient.id);
      attempted += 1;
    }
  }

  await completeFinishedCampaigns(now);

  return attempted;
}
