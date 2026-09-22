// OP-02–06: automatisk oppfølging av sendte tilbud og varsel om utløp.
// Kjøres KUN fra workeren (arbeidsregel 12) – eneste sted disse
// funksjonene kalles fra er src/worker/index.ts, så SMTP-kallet under er
// trygt her på samme måte som i src/modules/quotes/send.ts.
import { prisma } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { getMailClient } from '@/integrations/mail';
import { decryptSecret } from '@/lib/secrets';

import { computeNextFollowUpAt, resolveFollowUpRule } from './followup';

const EXPIRY_WARNING_WINDOW_DAYS = 3;

async function hasCustomerRepliedSince(customerId: string, sentAt: Date): Promise<boolean> {
  const reply = await prisma.emailMessage.findFirst({
    where: {
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: customerId,
      direction: 'IN',
      occurredAt: { gt: sentAt },
    },
  });
  return reply !== null;
}

/**
 * OP-03/OP-04: sender neste påminnelse for tilbud som har passert
 * `nextFollowUpAt`, med mindre kunden allerede har svart på e-post (OP-04)
 * eller tilbudet har utløpt gyldighet. Returnerer antall påminnelser sendt.
 */
export async function sendDueFollowUpReminders(now = new Date()): Promise<number> {
  const dueQuotes = await prisma.quote.findMany({
    where: { status: 'SENT', nextFollowUpAt: { lte: now } },
    include: { customer: { include: { groups: true } } },
  });

  let sent = 0;

  for (const quote of dueQuotes) {
    // Gyldigheten er utløpt – ingen vits i å minne om et tilbud som ikke
    // lenger gjelder. OP-06 dekker varsling til selger separat.
    if (quote.validUntil && quote.validUntil < now) {
      await prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'EXPIRED', nextFollowUpAt: null },
      });
      await recordActivity({
        type: 'STATUS',
        text: `Tilbud ${quote.number} satt til utløpt (gyldighet passert uten svar)`,
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: quote.customerId,
        createdById: null,
      });
      continue;
    }

    // OP-04: automatisk oppfølging stopper når kunden svarer på e-post.
    if (quote.sentAt && (await hasCustomerRepliedSince(quote.customerId, quote.sentAt))) {
      await prisma.quote.update({ where: { id: quote.id }, data: { nextFollowUpAt: null } });
      continue;
    }

    const rule = await resolveFollowUpRule({
      quoteId: quote.id,
      customerId: quote.customerId,
      customerGroupIds: quote.customer.groups.map((group) => group.id),
    });

    if (!rule || !rule.active || rule.daysSequence.length === 0 || !quote.sentAt) {
      await prisma.quote.update({ where: { id: quote.id }, data: { nextFollowUpAt: null } });
      continue;
    }

    if (!quote.customer.email || !quote.sentViaEmailAccountId) {
      await prisma.quote.update({ where: { id: quote.id }, data: { nextFollowUpAt: null } });
      continue;
    }

    const emailAccount = await prisma.emailAccount.findUnique({ where: { id: quote.sentViaEmailAccountId } });
    if (!emailAccount) {
      await prisma.quote.update({ where: { id: quote.id }, data: { nextFollowUpAt: null } });
      continue;
    }

    const template = rule.templateId ? await prisma.template.findUnique({ where: { id: rule.templateId } }) : null;
    const text =
      template?.content ??
      `Vi viser til tilbud ${quote.number} som vi ikke har hørt fra deg om ennå. Ta gjerne kontakt om du har spørsmål.`;

    const client = getMailClient();
    await client.sendAndArchive(
      {
        address: emailAccount.address,
        username: emailAccount.username,
        password: decryptSecret(emailAccount.encryptedPassword),
        imapHost: emailAccount.imapHost,
        imapPort: emailAccount.imapPort,
        smtpHost: emailAccount.smtpHost,
        smtpPort: emailAccount.smtpPort,
      },
      {
        to: [quote.customer.email],
        subject: `Påminnelse: tilbud ${quote.number} fra Pietra Unica`,
        text,
      },
    );

    const followUpsSent = quote.followUpsSent + 1;
    const nextFollowUpAt = computeNextFollowUpAt(quote.sentAt, rule.daysSequence, followUpsSent);

    await prisma.quote.update({
      where: { id: quote.id },
      data: { followUpsSent, nextFollowUpAt },
    });

    await recordActivity({
      type: 'EMAIL',
      text: `Automatisk påminnelse ${followUpsSent} sendt for tilbud ${quote.number}`,
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: quote.customerId,
      createdById: null,
    });

    await logAudit({
      userId: null,
      action: 'update',
      entityType: ENTITY_TYPES.QUOTE,
      entityId: quote.id,
      after: { followUpsSent, nextFollowUpAt },
    });

    sent += 1;
  }

  return sent;
}

/**
 * OP-06: varsel til selger når tilbud nærmer seg utløp av gyldighet, som en
 * oppgave (Task) på selgeren. Oppretter aldri samme varsel to ganger.
 */
export async function createExpiryWarningTasks(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + EXPIRY_WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const expiringQuotes = await prisma.quote.findMany({
    where: {
      status: { in: ['DRAFT', 'SENT', 'ANSWERED'] },
      validUntil: { gte: now, lte: soon },
      createdById: { not: null },
    },
  });

  let created = 0;

  for (const quote of expiringQuotes) {
    if (!quote.createdById || !quote.validUntil) {
      continue;
    }

    const existing = await prisma.task.findFirst({
      where: { entityType: ENTITY_TYPES.QUOTE, entityId: quote.id, status: 'OPEN' },
    });
    if (existing) {
      continue;
    }

    await prisma.task.create({
      data: {
        title: `Tilbud ${quote.number} nærmer seg utløp`,
        dueAt: quote.validUntil,
        assigneeId: quote.createdById,
        entityType: ENTITY_TYPES.QUOTE,
        entityId: quote.id,
        createdById: null,
      },
    });
    created += 1;
  }

  return created;
}

export async function runFollowUpCycle(now = new Date()): Promise<{ remindersSent: number; expiryWarnings: number }> {
  const remindersSent = await sendDueFollowUpReminders(now);
  const expiryWarnings = await createExpiryWarningTasks(now);
  return { remindersSent, expiryWarnings };
}
