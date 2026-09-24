// Dekker akseptansekriteriene for M8 (kravspesifikasjon kap. 19):
// - en kampanje kan opprettes, legges i sendekø og sendes til kvalifiserte
//   mottakere, med fartsgrense/gjenopptak (GR-01, GR-02, GR-04, GR-05, GR-07)
// - en AVMELD-e-post registrerer avmeldingen automatisk (GR-03)
// - salg vises i rapportsiden (GE-10)
// - et egendefinert felt kan opprettes og fylles ut på kundekortet (GE-09)
// - en API-nøkkel kan opprettes og brukes mot det åpne REST-API-et (GE-11)
//
// Selve SMTP-kallet for kampanjesending skjer normalt kun i workeren
// (arbeidsregel 12); testen kaller derfor processCampaignSendingQueue()
// direkte, samme mønster som M3/M5/M6/M7-testene bruker for sine
// worker-funksjoner.
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { getMockSentLog, resetMockMail, seedMockMailbox } from '../../src/integrations/mail/mock';
import { encryptSecret } from '../../src/lib/secrets';
import { processCampaignSendingQueue } from '../../src/modules/campaigns/send';
import { syncAccountFolder } from '../../src/modules/email/sync';
import { formatQuoteNumber, nextQuoteBaseNumber } from '../../src/modules/quotes/numbering';
import { E2E_ADMIN, TEST_DATABASE_URL } from './global-setup';
import { loginAs } from './helpers';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: 'serial' });

test('GR-01/02/04/05/07: kampanje opprettes, legges i sendekø og sendes til mottakere', async ({ page }) => {
  resetMockMail();
  await loginAs(page, E2E_ADMIN);

  const emailAccount = await prisma.emailAccount.create({
    data: {
      address: `nyhetsbrev-m8-${Date.now()}@pietraunica.test`,
      username: 'nyhetsbrev',
      encryptedPassword: encryptSecret('dummy-passord'),
      imapHost: 'imap.example.invalid',
      smtpHost: 'smtp.example.invalid',
      shared: true,
    },
  });

  const templateId = randomUUID();
  await prisma.template.create({
    data: {
      id: templateId,
      groupId: templateId,
      type: 'NEWSLETTER',
      name: `E2E M8-mal ${Date.now()}`,
      subject: 'Hei {{navn}}',
      content: 'Nytt fra Pietra Unica til {{navn}}!',
      status: 'PUBLISHED',
    },
  });

  // Egen kundegruppe slik at kampanjen kun treffer testkunden – et tomt
  // utvalg ville ellers truffet ALLE kunder i databasen (GR-01), inkludert
  // dem andre e2e-tester har opprettet i samme delte testdatabase.
  const group = await prisma.customerGroup.create({ data: { name: `E2E M8-gruppe ${Date.now()}` } });
  const customer = await prisma.customer.create({
    data: {
      type: 'PRIVATE',
      name: `E2E M8 Kunde ${Date.now()}`,
      email: `m8-kunde-${Date.now()}@kunde.test`,
      groups: { connect: { id: group.id } },
    },
  });

  await page.goto('/admin/campaigns/new');
  await page.locator('input[name="name"]').fill('E2E kampanje');
  await page.locator('select[name="templateId"]').selectOption(templateId);
  await page.locator('select[name="emailAccountId"]').selectOption(emailAccount.id);
  await page.locator(`input[name="customerGroupIds"][value="${group.id}"]`).check();
  await page.getByRole('button', { name: 'Opprett kladd' }).click();
  await page.waitForURL(/\/admin\/campaigns\/.+/);

  await expect(page.getByText('Kladd')).toBeVisible();
  await page.getByRole('button', { name: 'Legg i sendekø' }).click();

  const campaign = await prisma.emailCampaign.findFirstOrThrow({ where: { name: 'E2E kampanje' } });
  await expect.poll(async () => (await prisma.emailCampaign.findUnique({ where: { id: campaign.id } }))?.status).toBe('SENDING');

  const recipients = await prisma.emailCampaignRecipient.findMany({ where: { campaignId: campaign.id } });
  expect(recipients).toHaveLength(1);
  expect(recipients[0]!.customerId).toBe(customer.id);

  const attempted = await processCampaignSendingQueue();
  expect(attempted).toBe(1);

  const sentLog = getMockSentLog();
  const sentToCustomer = sentLog.find((entry) => entry.message.to.includes(customer.email!));
  expect(sentToCustomer).toBeDefined();
  expect(sentToCustomer!.message.subject).not.toContain('{{');
  expect(sentToCustomer!.message.headers?.['List-Unsubscribe']).toContain('mailto:');

  await page.goto(`/admin/campaigns/${campaign.id}`);
  await expect(page.getByText('Fullført')).toBeVisible();
  await expect(page.locator('table').getByText('Sendt', { exact: true })).toBeVisible();

  await prisma.emailCampaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.emailCampaign.delete({ where: { id: campaign.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.customerGroup.delete({ where: { id: group.id } });
  await prisma.template.delete({ where: { id: templateId } });
  await prisma.emailAccount.delete({ where: { id: emailAccount.id } });
});

test('GR-03: svar AVMELD på e-post registrerer avmelding automatisk', async ({ page }) => {
  resetMockMail();
  await loginAs(page, E2E_ADMIN);

  const emailAccount = await prisma.emailAccount.create({
    data: {
      address: `nyhetsbrev-avmeld-${Date.now()}@pietraunica.test`,
      username: 'nyhetsbrev',
      encryptedPassword: encryptSecret('dummy-passord'),
      imapHost: 'imap.example.invalid',
      smtpHost: 'smtp.example.invalid',
    },
  });
  const customer = await prisma.customer.create({
    data: { type: 'PRIVATE', name: `E2E Avmeld Kunde ${Date.now()}`, email: `avmeld-e2e-${Date.now()}@kunde.test` },
  });

  seedMockMailbox(emailAccount.address, 'INBOX', [
    {
      uid: 1,
      messageId: `<avmeld-${Date.now()}@kunde.test>`,
      inReplyTo: null,
      fromAddress: customer.email!,
      fromName: customer.name,
      toAddresses: [emailAccount.address],
      ccAddresses: [],
      subject: 'Re: Nyhetsbrev',
      textBody: 'AVMELD',
      occurredAt: new Date(),
      attachments: [],
    },
  ]);
  await syncAccountFolder(emailAccount, 'INBOX');

  await page.goto(`/customers/${customer.id}`);
  await expect(page.locator('span.font-medium', { hasText: 'Trukket' })).toBeVisible();

  await prisma.consent.deleteMany({ where: { customerId: customer.id } });
  await prisma.activity.deleteMany({ where: { entityId: customer.id } });
  await prisma.emailMessage.deleteMany({ where: { emailAccountId: emailAccount.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.emailAccount.delete({ where: { id: emailAccount.id } });
});

test('GE-10: salg per kunde vises på rapportsiden', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  const customer = await prisma.customer.create({
    data: { type: 'COMPANY', name: `E2E Rapport Kunde ${Date.now()}`, email: `rapport-${Date.now()}@kunde.test` },
  });
  const baseNumber = await nextQuoteBaseNumber();
  const quoteId = randomUUID();
  const quote = await prisma.quote.create({
    data: {
      id: quoteId,
      groupId: quoteId,
      baseNumber,
      number: formatQuoteNumber(baseNumber, 1),
      status: 'ACCEPTED',
      customerId: customer.id,
      totalMinor: 123_400,
    },
  });
  const order = await prisma.order.create({ data: { number: `ORD-E2E-GE10-${Date.now()}`, quoteId: quote.id, status: 'CONFIRMED' } });

  await page.goto('/admin/reports');
  const customerRow = page.locator('tr', { hasText: customer.name });
  await expect(customerRow).toBeVisible();
  await expect(customerRow).toContainText('NOK');

  await prisma.order.delete({ where: { id: order.id } });
  await prisma.quote.delete({ where: { id: quote.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
});

test('GE-09: egendefinert felt kan opprettes og fylles ut på kundekortet', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  const fieldLabel = `E2E Testfelt ${Date.now()}`;
  await page.goto('/admin/custom-fields');
  const customerForm = page.locator('form:has(input[name="entityType"][value="Customer"])');
  await customerForm.locator('input[name="label"]').fill(fieldLabel);
  await customerForm.getByRole('button', { name: 'Legg til' }).click();
  await expect(page.getByText(fieldLabel)).toBeVisible();

  const definition = await prisma.customFieldDefinition.findFirstOrThrow({ where: { label: fieldLabel } });
  const customer = await prisma.customer.create({ data: { type: 'COMPANY', name: `E2E GE-09 Kunde ${Date.now()}` } });

  await page.goto(`/customers/${customer.id}`);
  await page.locator(`input[name="customField__${definition.key}"]`).fill('Testverdi');
  await page.locator('section:has-text("Egendefinerte felt") button[type="submit"]').click();

  await expect.poll(async () =>
    (await prisma.customFieldValue.findFirst({ where: { entityType: 'Customer', entityId: customer.id, key: definition.key } }))?.value,
  ).toBe('Testverdi');

  await prisma.customFieldValue.deleteMany({ where: { key: definition.key } });
  await prisma.customFieldDefinition.delete({ where: { id: definition.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
});

test('GE-11: API-nøkkel opprettes i admin-UI og fungerer mot det åpne REST-API-et', async ({ page, request }) => {
  await loginAs(page, E2E_ADMIN);

  await page.goto('/admin/api-keys');
  const createKeyForm = page.locator('form:has(input[name="label"])');
  await createKeyForm.locator('input[name="label"]').fill('E2E nettbutikk');
  await createKeyForm.locator('input[name="scopes"]').first().check();
  await createKeyForm.getByRole('button', { name: 'Opprett nøkkel' }).click();

  const apiKey = await page.locator('code').innerText();
  expect(apiKey.startsWith('pu_')).toBe(true);

  const response = await request.get('/api/v1/materials', { headers: { authorization: `Bearer ${apiKey}` } });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { data: unknown[] };
  expect(Array.isArray(body.data)).toBe(true);

  const unauthorized = await request.get('/api/v1/materials');
  expect(unauthorized.status()).toBe(401);

  await prisma.apiKey.deleteMany({ where: { label: 'E2E nettbutikk' } });
});
