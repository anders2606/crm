// IN-04: en manuelt opplastet leverandørfaktura (PDF) videresendes som e-post
// til PowerOffice sitt fakturamottak. Kalles KUN fra workeren (arbeidsregel
// 12) – se kap. 18: kladd-forsøk via /JournalEntryVouchers/SupplierInvoices
// krever klientspesifikke kontoplan-id-er som ikke er kjent uten live data,
// så PowerOffice sin egen dokumenterte reserveløsning (e-postvideresending)
// brukes i stedet for et gjettet voucher-kall.
import type { PowerOfficeInvoiceForwardJobData } from '@/lib/jobs';
import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { getMailClient } from '@/integrations/mail';
import { decryptSecret } from '@/lib/secrets';
import { getStorage, readToBuffer } from '@/lib/storage';

import { getPowerOfficeSettings } from './settings';
import { recordSyncLog } from './sync-log';

export async function forwardSupplierInvoiceToPowerOffice(data: PowerOfficeInvoiceForwardJobData): Promise<void> {
  const [document, supplier, emailAccount, settings] = await Promise.all([
    prisma.document.findUnique({ where: { id: data.documentId } }),
    prisma.supplier.findUnique({ where: { id: data.supplierId } }),
    prisma.emailAccount.findUnique({ where: { id: data.emailAccountId } }),
    getPowerOfficeSettings(),
  ]);

  if (!document || !supplier || !emailAccount) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: ENTITY_TYPES.SUPPLIER,
      entityId: data.supplierId,
      message: 'Fant ikke dokument, leverandør eller e-postkonto – leverandørfaktura ble ikke videresendt.',
    });
    return;
  }

  const invoiceReceiptEmail = settings?.invoiceReceiptEmail;
  if (!invoiceReceiptEmail) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: ENTITY_TYPES.SUPPLIER,
      entityId: data.supplierId,
      message: 'PowerOffice sitt fakturamottak er ikke konfigurert (admin/poweroffice) – leverandørfaktura ble ikke videresendt.',
    });
    return;
  }

  try {
    const fileStream = await getStorage().read(document.storageKey);
    const buffer = await readToBuffer(fileStream);

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
        to: [invoiceReceiptEmail],
        subject: `Leverandørfaktura – ${supplier.name}`,
        text: `Vedlagt følger en leverandørfaktura fra ${supplier.name}, videresendt fra Pietra Unica CRM.`,
        attachments: [{ filename: document.fileName, contentType: document.mimeType, content: buffer }],
      },
    );

    await recordActivity({
      type: 'EMAIL',
      text: `Leverandørfaktura ${document.fileName} videresendt til PowerOffice (${invoiceReceiptEmail})`,
      entityType: ENTITY_TYPES.SUPPLIER,
      entityId: supplier.id,
      createdById: data.userId,
    });

    await logAudit({
      userId: data.userId,
      action: 'update',
      entityType: 'Document',
      entityId: document.id,
      after: { forwardedToPowerOffice: true, invoiceReceiptEmail },
    });

    await recordSyncLog({
      direction: 'out',
      status: 'success',
      entityType: ENTITY_TYPES.SUPPLIER,
      entityId: supplier.id,
      message: `Leverandørfaktura ${document.fileName} videresendt til PowerOffice sitt fakturamottak.`,
    });
  } catch (error) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: ENTITY_TYPES.SUPPLIER,
      entityId: supplier.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
