// Ekte IMAP/SMTP-integrasjon (imapflow, nodemailer, mailparser – navngitt i
// kap. 15/18). Kjøres kun fra workeren (arbeidsregel 12), aldri direkte i en
// brukerforespørsel.
import { ImapFlow } from 'imapflow';
import type { AddressObject } from 'mailparser';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';

import type {
  MailAccountCredentials,
  MailAttachment,
  MailClient,
  OutgoingMessage,
  ParsedIncomingMessage,
} from './types';

function addressList(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) {
    return [];
  }
  const list = Array.isArray(field) ? field : [field];
  return list.flatMap((entry) => entry.value.map((v) => v.address ?? '')).filter(Boolean);
}

function createImapClient(account: MailAccountCredentials): ImapFlow {
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.username, pass: account.password },
    logger: false,
  });
}

async function parseMessage(uid: number, source: Buffer): Promise<ParsedIncomingMessage> {
  const parsed = await simpleParser(source);
  const attachments: MailAttachment[] = (parsed.attachments ?? []).map((attachment) => ({
    filename: attachment.filename ?? 'vedlegg',
    contentType: attachment.contentType,
    content: attachment.content,
  }));

  const from = Array.isArray(parsed.from) ? parsed.from[0] : parsed.from;

  return {
    uid,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    fromAddress: from?.value[0]?.address ?? '',
    fromName: from?.value[0]?.name || null,
    toAddresses: addressList(parsed.to),
    ccAddresses: addressList(parsed.cc),
    subject: parsed.subject ?? null,
    textBody: parsed.text ?? null,
    occurredAt: parsed.date ?? new Date(),
    attachments,
  };
}

export const realMailClient: MailClient = {
  async fetchNewMessages(account, folder, sinceUid) {
    const client = createImapClient(account);
    await client.connect();
    const messages: ParsedIncomingMessage[] = [];

    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const range = `${sinceUid + 1}:*`;
        for await (const message of client.fetch(range, { uid: true, source: true }, { uid: true })) {
          if (message.uid <= sinceUid || !message.source) {
            continue; // '*' kan gi siste melding selv når mappen er tom eller ajour
          }
          messages.push(await parseMessage(message.uid, message.source));
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return messages;
  },

  async watch(account, folder, onNewMail) {
    const client = createImapClient(account);
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    client.on('exists', () => onNewMail());

    let stopped = false;
    void (async () => {
      while (!stopped) {
        try {
          await client.idle();
        } catch {
          if (!stopped) {
            break;
          }
        }
      }
    })();

    return async () => {
      stopped = true;
      lock.release();
      await client.logout();
    };
  },

  async sendAndArchive(account, message: OutgoingMessage) {
    const composer = new MailComposer({
      from: account.address,
      to: message.to.join(', '),
      cc: message.cc?.join(', '),
      subject: message.subject,
      text: message.text,
      headers: message.headers,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    const raw: Buffer = await new Promise((resolve, reject) => {
      composer.compile().build((error, builtMessage) => {
        if (error) {
          reject(error);
        } else {
          resolve(builtMessage);
        }
      });
    });

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: { user: account.username, pass: account.password },
    });
    const info = await transporter.sendMail({ raw });

    // Samme MIME-kilde som ble sendt, arkiveres i Sendt-mappen (IMAP APPEND),
    // slik at den også vises i Apple Mail (kap. 18).
    const client = createImapClient(account);
    await client.connect();
    try {
      await client.append('Sent', raw, ['\\Seen']);
    } finally {
      await client.logout();
    }

    return { messageId: info.messageId };
  },
};
