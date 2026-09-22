// Dekker akseptansekriteriene for M6 (kravspesifikasjon kap. 19):
// - en kunde med org.nr. som allerede finnes i PowerOffice kobles til
//   eksisterende post i stedet for å opprette duplikat (IN-01)
// - med synk aktivert og tomt CRM hentes ingen eksisterende PowerOffice-
//   kunder inn før administrator eksplisitt velger det (IN-01)
// - en ordre overført til PowerOffice demo gir et fakturagrunnlag med
//   riktige linjer og MVA (IN-02)
// - reskontro synkes og kredittgrense varsles på kundekortet (IN-03/KU-03)
//
// Selve PowerOffice-kallene skjer normalt kun i workeren (arbeidsregel 12);
// testene kaller derfor synk-/overføringsfunksjonene direkte (samme mønster
// som M3/M5-testene kaller syncAccountFolder/prepareQuoteForSending direkte)
// i stedet for å kjøre en egen workerprosess under e2e-kjøringen.
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import {
  getMockSalesOrders,
  mockPowerOfficeClient,
  resetMockPowerOffice,
  seedMockPowerOfficeBalance,
  seedMockPowerOfficeCustomer,
} from '../../src/integrations/poweroffice/mock';
import { getMockSentLog, resetMockMail } from '../../src/integrations/mail/mock';
import { encryptSecret } from '../../src/lib/secrets';
import { syncAllCustomerBalances } from '../../src/modules/poweroffice/balances';
import { forwardSupplierInvoiceToPowerOffice } from '../../src/modules/poweroffice/invoice-forward';
import { transferOrderToPowerOffice } from '../../src/modules/poweroffice/order-transfer';
import { importAllFromPowerOffice, matchOrCreateCustomer } from '../../src/modules/poweroffice/sync';
import { formatQuoteNumber, nextQuoteBaseNumber } from '../../src/modules/quotes/numbering';
import { E2E_ADMIN, TEST_DATABASE_URL } from './global-setup';
import { loginAs } from './helpers';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: 'serial' });

async function configurePowerOffice(
  page: Page,
  writeEnabled: boolean,
  invoiceReceiptEmail?: string,
): Promise<void> {
  await page.goto('/admin/poweroffice');
  await page.locator('select[name="environment"]').selectOption('DEMO');
  await page.locator('input[name="applicationKey"]').fill('e2e-application-key');
  await page.locator('input[name="clientKey"]').fill('e2e-client-key');
  await page.locator('input[name="subscriptionKey"]').fill('e2e-subscription-key');
  if (invoiceReceiptEmail) {
    await page.locator('input[name="invoiceReceiptEmail"]').fill(invoiceReceiptEmail);
  }
  await page.locator('input[name="writeEnabled"]').setChecked(writeEnabled);
  await page.getByRole('button', { name: 'Lagre' }).click();
  await expect
    .poll(async () => (await prisma.powerOfficeSettings.findUnique({ where: { id: 'singleton' } }))?.writeEnabled)
    .toBe(writeEnabled);
}

test('IN-01: kunde med org.nr. som finnes i PowerOffice kobles til eksisterende post, uten duplikat', async ({
  page,
}) => {
  resetMockPowerOffice();
  await loginAs(page, E2E_ADMIN);
  await configurePowerOffice(page, true);

  const orgNr = `9001${Date.now()}`.slice(0, 9);
  seedMockPowerOfficeCustomer({
    powerOfficeId: 'po-existing-1',
    name: 'Eksisterende Marmor AS',
    orgNr,
    email: null,
    phone: null,
    paymentTermsDays: null,
  });

  await page.goto('/customers/new');
  await page.getByLabel('Navn', { exact: true }).fill('Ny lokal registrering');
  await page.getByLabel('Organisasjonsnummer').fill(orgNr);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  const customerId = page.url().split('/').pop()!;

  await matchOrCreateCustomer(customerId);

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  expect(customer.poweroffice_id).toBe('po-existing-1');

  const remoteCustomers = await mockPowerOfficeClient.listCustomers();
  expect(remoteCustomers).toHaveLength(1); // ingen duplikat opprettet i PowerOffice

  await prisma.customer.delete({ where: { id: customerId } });
});

test('IN-01: tomt CRM henter ikke inn eksisterende PowerOffice-poster automatisk – kun når administrator velger det', async ({
  page,
}) => {
  resetMockPowerOffice();
  await loginAs(page, E2E_ADMIN);
  await configurePowerOffice(page, true);

  const untouchedOrgNr = `9002${Date.now()}`.slice(0, 9);
  seedMockPowerOfficeCustomer({
    powerOfficeId: 'po-untouched-1',
    name: 'Ikke hentet inn ennå AS',
    orgNr: untouchedOrgNr,
    email: null,
    phone: null,
    paymentTermsDays: null,
  });

  // Ingen kobling/import er kjørt ennå – den eksisterende PowerOffice-kunden
  // skal ikke dukke opp lokalt av seg selv.
  const localMatchBeforeImport = await prisma.customer.findFirst({ where: { orgNr: untouchedOrgNr } });
  expect(localMatchBeforeImport).toBeNull();

  // Registrering av en HELT NY kunde (uten match) skal opprette i PowerOffice
  // når skriving er aktivert, uten å påvirke den utenforstående kunden over.
  const newOrgNr = `9003${Date.now()}`.slice(0, 9);
  await page.goto('/customers/new');
  await page.getByLabel('Navn', { exact: true }).fill('Helt ny kunde uten match');
  await page.getByLabel('Organisasjonsnummer').fill(newOrgNr);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  const newCustomerId = page.url().split('/').pop()!;

  await matchOrCreateCustomer(newCustomerId);
  const newCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: newCustomerId } });
  expect(newCustomer.poweroffice_id).not.toBeNull();
  expect(newCustomer.poweroffice_id).not.toBe('po-untouched-1');

  // Administrator velger eksplisitt å hente inn "alle" – først da dukker den
  // gjenværende, ukoblede PowerOffice-kunden opp lokalt.
  await importAllFromPowerOffice();
  const localMatchAfterImport = await prisma.customer.findFirst({ where: { orgNr: untouchedOrgNr } });
  expect(localMatchAfterImport).not.toBeNull();
  expect(localMatchAfterImport?.poweroffice_id).toBe('po-untouched-1');

  await prisma.customer.deleteMany({ where: { id: { in: [newCustomerId, localMatchAfterImport!.id] } } });
});

test('IN-02: en ordre overført til PowerOffice demo gir et fakturagrunnlag med riktige linjer og MVA', async ({
  page,
}) => {
  resetMockPowerOffice();
  await loginAs(page, E2E_ADMIN);
  await configurePowerOffice(page, true);

  const admin = await prisma.user.findFirstOrThrow({ where: { email: E2E_ADMIN.email } });
  const customer = await prisma.customer.create({
    data: { type: 'COMPANY', name: `E2E Ordrekunde ${Date.now()}`, createdById: admin.id },
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
      lines: {
        create: [
          {
            description: 'Benkeplate i marmor',
            quantityMilli: 2_500, // 2,5 m²
            unit: 'm²',
            unitPriceMinor: 400_000,
            vatRatePercent: 25,
            lineTotalMinor: 1_000_000,
          },
        ],
      },
    },
  });
  await prisma.quote.update({
    where: { id: quote.id },
    data: { subtotalMinor: 1_000_000, vatMinor: 250_000, totalMinor: 1_250_000 },
  });

  const order = await prisma.order.create({
    data: { number: `ORD-E2E-${Date.now()}`, quoteId: quote.id, status: 'CONFIRMED' },
  });

  await transferOrderToPowerOffice(order.id, admin.id);

  const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(updatedOrder.transferredToPowerOffice).toBe(true);
  expect(updatedOrder.poweroffice_id).not.toBeNull();

  const salesOrder = getMockSalesOrders().get(updatedOrder.poweroffice_id!);
  expect(salesOrder).toBeDefined();
  expect(salesOrder!.lines).toHaveLength(1);
  expect(salesOrder!.lines[0]).toMatchObject({
    description: 'Benkeplate i marmor',
    quantityMilli: 2_500,
    unitPriceMinor: 400_000,
  });

  // MVA er beregnet og lagret korrekt i CRM (kap. 18: PowerOffice sine
  // salgsordrelinjer har ikke noe eget MVA-felt – MVA-beregningen som
  // følger fakturagrunnlaget er CRM sitt ansvar, se
  // src/integrations/poweroffice/types.ts).
  const finalQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  expect(finalQuote.vatMinor).toBe(250_000);
  expect(finalQuote.totalMinor).toBe(1_250_000);

  await page.goto(`/orders/${order.id}`);
  await expect(page.getByText(/Overført til PowerOffice/)).toBeVisible();

  await prisma.order.delete({ where: { id: order.id } });
  await prisma.quote.delete({ where: { id: quote.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
});

test('IN-03/KU-03: reskontrosynk oppdaterer kundekortet og varsler ved overskredet kredittgrense', async ({
  page,
}) => {
  resetMockPowerOffice();
  await loginAs(page, E2E_ADMIN);
  await configurePowerOffice(page, true);

  const admin = await prisma.user.findFirstOrThrow({ where: { email: E2E_ADMIN.email } });
  const customer = await prisma.customer.create({
    data: {
      type: 'COMPANY',
      name: `E2E Kredittkunde ${Date.now()}`,
      poweroffice_id: 'po-credit-1',
      creditLimitCents: 500_000,
      creditLimitCurrency: 'NOK',
      createdById: admin.id,
    },
  });

  seedMockPowerOfficeBalance('po-credit-1', {
    outstandingBalanceMinor: 750_000,
    overdueAmountMinor: 200_000,
    openItems: [],
  });

  const synced = await syncAllCustomerBalances();
  expect(synced).toBeGreaterThanOrEqual(1);

  await page.goto(`/customers/${customer.id}`);
  await expect(page.getByText(/Utestående saldo \(PowerOffice/)).toBeVisible();
  await expect(page.getByText(/Kredittgrensen er overskredet/)).toBeVisible();

  await prisma.customer.delete({ where: { id: customer.id } });
});

test('IN-04: leverandørfaktura lastet opp på leverandørkortet videresendes til PowerOffice sitt fakturamottak', async ({
  page,
}) => {
  resetMockMail();
  await loginAs(page, E2E_ADMIN);
  await configurePowerOffice(page, false, 'faktura-e2e@fakturamottak.poweroffice.net');

  const admin = await prisma.user.findFirstOrThrow({ where: { email: E2E_ADMIN.email } });
  const supplier = await prisma.supplier.create({
    data: { name: `E2E Leverandør ${Date.now()}`, country: 'IT', createdById: admin.id },
  });
  const emailAccount = await prisma.emailAccount.create({
    data: {
      address: `okonomi-${Date.now()}@pietraunica.test`,
      username: 'okonomi',
      encryptedPassword: encryptSecret('dummy-passord'),
      imapHost: 'imap.example.invalid',
      smtpHost: 'smtp.example.invalid',
      ownerUserId: admin.id,
      createdById: admin.id,
    },
  });

  await page.goto(`/suppliers/${supplier.id}`);
  const invoiceForm = page.locator('form', {
    has: page.getByRole('button', { name: 'Last opp og send til PowerOffice' }),
  });
  await invoiceForm
    .locator('input[type="file"][name="file"]')
    .setInputFiles({ name: 'faktura-e2e.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') });
  await invoiceForm.locator('select[name="emailAccountId"]').selectOption(emailAccount.id);
  await invoiceForm.getByRole('button', { name: 'Last opp og send til PowerOffice' }).click();
  await expect
    .poll(async () => prisma.document.findFirst({ where: { entityId: supplier.id, category: 'INVOICE' } }))
    .not.toBeNull();

  const document = await prisma.document.findFirstOrThrow({ where: { entityId: supplier.id, category: 'INVOICE' } });

  // Selve SMTP-kallet skjer kun i workeren (arbeidsregel 12) – simulerer at
  // workeren behandler jobben serveraksjonen la i køen.
  await forwardSupplierInvoiceToPowerOffice({
    documentId: document.id,
    supplierId: supplier.id,
    emailAccountId: emailAccount.id,
    userId: admin.id,
  });

  const sentLog = getMockSentLog();
  expect(sentLog).toHaveLength(1);
  expect(sentLog[0]!.message.to).toEqual(['faktura-e2e@fakturamottak.poweroffice.net']);
  expect(sentLog[0]!.message.attachments).toHaveLength(1);
  expect(sentLog[0]!.message.attachments![0]!.filename).toBe('faktura-e2e.pdf');

  await prisma.document.delete({ where: { id: document.id } });
  await prisma.emailAccount.delete({ where: { id: emailAccount.id } });
  await prisma.supplier.delete({ where: { id: supplier.id } });
});
