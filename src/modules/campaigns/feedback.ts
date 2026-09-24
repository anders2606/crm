// GR-03/GR-07: fanger opp svar på kampanje-e-post fra den vanlige
// e-postsynken (M3, `syncAccountFolder`/`storeMessage` i
// src/modules/email/sync.ts) – enten en AVMELD-tekst fra en kjent kunde,
// eller en automatisk returmelding (bounce) fra mottakerserveren. Kjøres
// alltid fra workeren, aldri i en brukerforespørsel (arbeidsregel 12).
import type { ParsedIncomingMessage } from '@/integrations/mail';
import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';

import { extractCandidateEmailAddresses, isBounceMessage } from './bounce';
import { NEWSLETTER_CONSENT_CHANNEL } from './segment';

const AVMELD_PATTERN = /\bavmeld\w*\b/i;

/** GR-03: registrerer avmeldingen og utelater kunden fra ikke-sendte utsendelser i sendekø. */
async function handleUnsubscribeReply(customerId: string): Promise<void> {
  await prisma.consent.create({
    data: {
      channel: NEWSLETTER_CONSENT_CHANNEL,
      status: 'WITHDRAWN',
      source: 'E-post (svarte AVMELD)',
      customerId,
    },
  });

  await prisma.emailCampaignRecipient.updateMany({
    where: { customerId, status: 'QUEUED' },
    data: { status: 'UNSUBSCRIBED' },
  });

  await recordActivity({
    type: 'STATUS',
    text: 'Avmeldt nyhetsbrev (svarte AVMELD på e-post)',
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customerId,
    createdById: null,
  });

  await logAudit({
    userId: null,
    action: 'update',
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customerId,
    after: { newsletterConsent: 'WITHDRAWN' },
  });
}

/** GR-07: markerer bounce på siste sendte kampanje-e-post og utelater kunden fra senere utsendelser. */
async function handleBounce(message: ParsedIncomingMessage): Promise<void> {
  const candidateEmails = extractCandidateEmailAddresses(message.textBody);
  if (candidateEmails.length === 0) {
    return;
  }

  const customers = await prisma.customer.findMany({
    where: { email: { in: candidateEmails, mode: 'insensitive' } },
  });

  for (const customer of customers) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { emailBounced: true, emailBouncedAt: new Date() },
    });

    const recentSend = await prisma.emailCampaignRecipient.findFirst({
      where: { customerId: customer.id, status: 'SENT', bouncedAt: null },
      orderBy: { sentAt: 'desc' },
    });
    if (recentSend) {
      await prisma.emailCampaignRecipient.update({
        where: { id: recentSend.id },
        data: { status: 'BOUNCED', bouncedAt: new Date() },
      });
    }

    await prisma.emailCampaignRecipient.updateMany({
      where: { customerId: customer.id, status: 'QUEUED' },
      data: { status: 'SKIPPED', errorMessage: 'Utelatt: e-postadressen har gitt permanent retur (bounce)' },
    });

    await recordActivity({
      type: 'STATUS',
      text: 'E-post returnert (permanent retur) – utelates fra senere utsendelser til adressen rettes',
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: customer.id,
      createdById: null,
    });
  }
}

export async function processInboundCampaignFeedback(
  message: ParsedIncomingMessage,
  match: { entityType: string; entityId: string } | null,
): Promise<void> {
  const isFromKnownCustomer = match?.entityType === ENTITY_TYPES.CUSTOMER;
  if (isFromKnownCustomer && AVMELD_PATTERN.test(`${message.subject ?? ''} ${message.textBody ?? ''}`)) {
    await handleUnsubscribeReply(match.entityId);
    return;
  }

  if (isBounceMessage(message)) {
    await handleBounce(message);
  }
}
