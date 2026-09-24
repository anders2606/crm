// M3: synker én mappe på én e-postkonto. Kalles fra workeren (periodisk og
// ved IMAP IDLE-varsel), aldri direkte fra en brukerforespørsel
// (arbeidsregel 12). EP-01/EP-02/EP-04/EP-05.
import type { EmailAccount } from '@prisma/client';

import { recordActivity } from '@/lib/activity';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/secrets';
import { enqueuePowerOfficeInvoiceForward } from '@/lib/jobs';
import { getMailClient } from '@/integrations/mail';
import type { MailAccountCredentials, ParsedIncomingMessage } from '@/integrations/mail';
import { processInboundCampaignFeedback } from '@/modules/campaigns/feedback';
import { saveDocumentBuffer } from '@/modules/documents/service';

import { findEntityForAddresses } from './linking';

function toCredentials(account: EmailAccount): MailAccountCredentials {
  return {
    address: account.address,
    username: account.username,
    password: decryptSecret(account.encryptedPassword),
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
  };
}

function readLastSeenUid(account: EmailAccount, folder: string): number {
  const map = (account.lastSeenUid ?? {}) as Record<string, number>;
  return map[folder] ?? 0;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** Synker én mappe. Returnerer antall nye meldinger lagret. */
export async function syncAccountFolder(account: EmailAccount, folder: string): Promise<number> {
  const client = getMailClient();
  const credentials = toCredentials(account);
  const sinceUid = readLastSeenUid(account, folder);
  const messages = await client.fetchNewMessages(credentials, folder, sinceUid);

  let maxUid = sinceUid;
  let stored = 0;

  for (const message of messages) {
    if (await storeMessage(account, folder, message)) {
      stored += 1;
    }
    maxUid = Math.max(maxUid, message.uid);
  }

  if (maxUid > sinceUid) {
    const map = (account.lastSeenUid ?? {}) as Record<string, number>;
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastSeenUid: { ...map, [folder]: maxUid } },
    });
  }

  return stored;
}

async function storeMessage(
  account: EmailAccount,
  folder: string,
  message: ParsedIncomingMessage,
): Promise<boolean> {
  const direction = folder === 'Sent' ? 'OUT' : 'IN';
  const matchAddresses =
    direction === 'IN' ? [message.fromAddress] : [...message.toAddresses, ...message.ccAddresses];
  const match = await findEntityForAddresses(matchAddresses);

  let created;
  try {
    created = await prisma.emailMessage.create({
      data: {
        emailAccountId: account.id,
        folder,
        uid: message.uid,
        messageId: message.messageId,
        inReplyTo: message.inReplyTo,
        direction,
        fromAddress: message.fromAddress,
        fromName: message.fromName,
        toAddresses: message.toAddresses,
        ccAddresses: message.ccAddresses,
        subject: message.subject,
        textBody: message.textBody,
        occurredAt: message.occurredAt,
        entityType: match?.entityType ?? null,
        entityId: match?.entityId ?? null,
      },
    });
  } catch (error) {
    // Unik (emailAccountId, folder, uid): samme e-post synkronisert to ganger gir én rad.
    if (isUniqueConstraintError(error)) {
      return false;
    }
    throw error;
  }

  // EP-04: vedlegg lagres i dokumentarkivet – til matchet entitet, ellers
  // midlertidig under selve meldingen inntil den tilordnes manuelt (EP-05).
  const targetEntityType = match?.entityType ?? ENTITY_TYPES.EMAIL_MESSAGE;
  const targetEntityId = match?.entityId ?? created.id;

  for (const attachment of message.attachments) {
    // BI-01/LE-07: en PDF-faktura fra en e-post allerede koblet til riktig
    // leverandør videresendes automatisk til PowerOffice sitt fakturamottak
    // (samme workerflyt som manuell opplasting, IN-04/M6). Ukjente avsendere
    // (ingen match) rører vi ikke – de skal først tilordnes manuelt (EP-05).
    const isSupplierInvoice =
      direction === 'IN' && attachment.contentType === 'application/pdf' && match?.entityType === ENTITY_TYPES.SUPPLIER;

    const document = await saveDocumentBuffer({
      entityType: targetEntityType,
      entityId: targetEntityId,
      category: isSupplierInvoice ? 'INVOICE' : 'OTHER',
      fileName: attachment.filename,
      mimeType: attachment.contentType,
      buffer: attachment.content,
      userId: null,
    });

    if (isSupplierInvoice && match) {
      await enqueuePowerOfficeInvoiceForward({
        documentId: document.id,
        supplierId: match.entityId,
        emailAccountId: account.id,
        userId: null,
      });
    }
  }

  if (match) {
    await recordActivity({
      type: 'EMAIL',
      text: message.subject ? `E-post: ${message.subject}` : 'E-post uten emne',
      entityType: match.entityType,
      entityId: match.entityId,
      createdById: null,
      occurredAt: message.occurredAt,
    });
  }

  // GR-03/GR-07: en innkommende e-post kan være svar på en kampanje-
  // utsendelse (AVMELD) eller en automatisk returmelding (bounce).
  if (direction === 'IN') {
    await processInboundCampaignFeedback(message, match);
  }

  return true;
}
