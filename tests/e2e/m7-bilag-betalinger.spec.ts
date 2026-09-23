// Dekker akseptansekriteriene for M7 (kravspesifikasjon kap. 19):
// - samme PDF-faktura mottatt to ganger lastes bare opp én gang til
//   PowerOffice (BI-01, BI-04, LE-07)
// - en betalt faktura i PowerOffice vises som betalt i CRM etter neste
//   synk (IN-10, IN-11, IN-12)
// - bilag og betalingsstatus vises på leverandørkortet (BI-02, BI-03)
//
// Selve PowerOffice-/e-postkallene skjer normalt kun i workeren
// (arbeidsregel 12); testene kaller derfor synk-/videresendingsfunksjonene
// direkte (samme mønster som M3/M5/M6-testene) i stedet for å kjøre en egen
// workerprosess under e2e-kjøringen.
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { resetMockPowerOffice, seedMockOutgoingInvoice } from '../../src/integrations/poweroffice/mock';
import { getMockSentLog, resetMockMail, seedMockMailbox } from '../../src/integrations/mail/mock';
import { encryptSecret } from '../../src/lib/secrets';
import { syncAccountFolder } from '../../src/modules/email/sync';
import { forwardSupplierInvoiceToPowerOffice } from '../../src/modules/poweroffice/invoice-forward';
import { syncOrderPaymentStatuses } from '../../src/modules/poweroffice/order-payments';
import { formatQuoteNumber, nextQuoteBaseNumber } from '../../src/modules/quotes/numbering';
import { E2E_ADMIN, TEST_DATABASE_URL } from './global-setup';
import { loginAs } from './helpers';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: 'serial' });

test('BI-01/BI-04/LE-07: samme PDF-faktura mottatt to ganger på e-post lastes bare opp én gang til PowerOffice', async ({
  page,
}) => {
  resetMockMail();
  await loginAs(page, E2E_ADMIN);

  await page.goto('/admin/poweroffice');
  await page.locator('select[name="environment"]').selectOption('DEMO');
  await page.locator('input[name="applicationKey"]').fill('e2e-application-key');
  await page.locator('input[name="clientKey"]').fill('e2e-client-key');
  await page.locator('input[name="subscriptionKey"]').fill('e2e-subscription-key');
  await page.locator('input[name="invoiceReceiptEmail"]').fill('faktura-m7@fakturamottak.poweroffice.net');
  await page.getByRole('button', { name: 'Lagre' }).click();
  await expect
    .poll(async () => (await prisma.powerOfficeSettings.findUnique({ where: { id: 'singleton' } }))?.invoiceReceiptEmail)
    .toBe('faktura-m7@fakturamottak.poweroffice.net');

  const admin = await prisma.user.findFirstOrThrow({ where: { email: E2E_ADMIN.email } });
  const supplier = await prisma.supplier.create({
    data: { name: `E2E BI-04 Leverandør ${Date.now()}`, country: 'IT', email: `bi04-${Date.now()}@leverandor.it` },
  });
  const emailAccount = await prisma.emailAccount.create({
    data: {
      address: `okonomi-bi04-${Date.now()}@pietraunica.test`,
      username: 'okonomi',
      encryptedPassword: encryptSecret('dummy-passord'),
      imapHost: 'imap.example.invalid',
      smtpHost: 'smtp.example.invalid',
      shared: true,
      createdById: admin.id,
    },
  });

  const pdfContent = Buffer.from('%PDF-1.4 m7 e2e faktura');

  seedMockMailbox(emailAccount.address, 'INBOX', [
    {
      uid: 101,
      messageId: '<bi04-invoice@leverandor.it>',
      inReplyTo: null,
      fromAddress: supplier.email!,
      fromName: 'E2E BI-04 Leverandør',
      toAddresses: [emailAccount.address],
      ccAddresses: [],
      subject: 'Faktura 3001',
      textBody: 'Vedlagt faktura',
      occurredAt: new Date(),
      attachments: [{ filename: 'faktura-3001.pdf', contentType: 'application/pdf', content: pdfContent }],
    },
    {
      uid: 102,
      messageId: '<bi04-invoice-purring@leverandor.it>',
      inReplyTo: null,
      fromAddress: supplier.email!,
      fromName: 'E2E BI-04 Leverandør',
      toAddresses: [emailAccount.address],
      ccAddresses: [],
      subject: 'Purring: Faktura 3001',
      textBody: 'Purring – vedlagt samme faktura på nytt',
      occurredAt: new Date(),
      attachments: [{ filename: 'faktura-3001.pdf', contentType: 'application/pdf', content: pdfContent }],
    },
  ]);

  await syncAccountFolder(emailAccount, 'INBOX');

  const invoiceDocuments = await prisma.document.findMany({
    where: { entityType: 'Supplier', entityId: supplier.id, category: 'INVOICE' },
    orderBy: { createdAt: 'asc' },
  });
  expect(invoiceDocuments).toHaveLength(2); // begge e-postene arkiveres, men skal kun forårsake én reell utsending

  for (const document of invoiceDocuments) {
    await forwardSupplierInvoiceToPowerOffice({
      documentId: document.id,
      supplierId: supplier.id,
      emailAccountId: emailAccount.id,
      userId: admin.id,
    });
  }

  const sentLog = getMockSentLog();
  expect(sentLog).toHaveLength(1);
  expect(sentLog[0]!.message.to).toEqual(['faktura-m7@fakturamottak.poweroffice.net']);

  const syncLogs = await prisma.syncLog.findMany({ where: { entityId: supplier.id } });
  expect(syncLogs.some((log) => log.message?.includes('Hoppet over'))).toBe(true);

  await prisma.document.deleteMany({ where: { entityId: supplier.id } });
  await prisma.emailMessage.deleteMany({ where: { emailAccountId: emailAccount.id } });
  await prisma.emailAccount.delete({ where: { id: emailAccount.id } });
  await prisma.supplier.delete({ where: { id: supplier.id } });
});

test('BI-02/BI-03: bilag og betalingsstatus vises på leverandørkortet', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  const supplier = await prisma.supplier.create({
    data: {
      name: `E2E BI-02 Leverandør ${Date.now()}`,
      country: 'IT',
      poweroffice_id: `po-bi02-${Date.now()}`,
    },
  });

  await prisma.supplierInvoiceStatus.create({
    data: {
      supplierId: supplier.id,
      powerOfficeId: 'po-bi02-invoice-1',
      invoiceNo: '2024-555',
      totalAmountMinor: 80_000,
      balanceMinor: 0,
      status: 'PAID',
    },
  });

  await page.goto(`/suppliers/${supplier.id}`);
  await expect(page.getByText('2024-555')).toBeVisible();
  await expect(page.getByText('Betalt', { exact: true })).toBeVisible();

  await prisma.supplierInvoiceStatus.deleteMany({ where: { supplierId: supplier.id } });
  await prisma.supplier.delete({ where: { id: supplier.id } });
});

test('IN-10/11/12: en betalt faktura i PowerOffice vises som betalt i CRM etter neste synk', async ({ page }) => {
  resetMockPowerOffice();
  await loginAs(page, E2E_ADMIN);

  const admin = await prisma.user.findFirstOrThrow({ where: { email: E2E_ADMIN.email } });
  const customer = await prisma.customer.create({
    data: { type: 'COMPANY', name: `E2E IN-12 Kunde ${Date.now()}`, createdById: admin.id },
  });

  const baseNumber = await nextQuoteBaseNumber();
  const quoteId = crypto.randomUUID();
  const quote = await prisma.quote.create({
    data: {
      id: quoteId,
      groupId: quoteId,
      baseNumber,
      number: formatQuoteNumber(baseNumber, 1),
      revision: 1,
      isCurrent: true,
      status: 'ACCEPTED',
      customerId: customer.id,
      currency: 'NOK',
      totalMinor: 90_000,
    },
  });

  const order = await prisma.order.create({
    data: {
      number: `ORD-E2E-IN12-${Date.now()}`,
      quoteId: quote.id,
      status: 'CONFIRMED',
      transferredToPowerOffice: true,
      poweroffice_id: `po-in12-order-${Date.now()}`,
    },
  });

  seedMockOutgoingInvoice(order.number, {
    powerOfficeId: 'po-in12-invoice-1',
    invoiceNo: '7001',
    totalAmountMinor: 90_000,
    balanceMinor: 0, // fullt betalt i PowerOffice
    dueDate: '2024-04-01',
  });

  await prisma.powerOfficeSettings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      environment: 'DEMO',
      encryptedApplicationKey: encryptSecret('e2e-application-key'),
      encryptedClientKey: encryptSecret('e2e-client-key'),
      encryptedSubscriptionKey: encryptSecret('e2e-subscription-key'),
    },
    update: {},
  });

  const synced = await syncOrderPaymentStatuses();
  expect(synced).toBeGreaterThanOrEqual(1);

  await page.goto(`/orders/${order.id}`);
  await expect(page.getByText(/Faktura 7001/)).toBeVisible();
  await expect(page.getByText('Betalt', { exact: true })).toBeVisible();

  await page.goto(`/customers/${customer.id}`);
  await expect(page.getByText(order.number)).toBeVisible();

  await prisma.order.delete({ where: { id: order.id } });
  await prisma.quote.delete({ where: { id: quote.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
});
