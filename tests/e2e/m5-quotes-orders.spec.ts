// Dekker akseptansekriteriene for M5 (kravspesifikasjon kap. 19):
// - et tilbud til en privatkunde får automatisk vilkår for privatkunder (TO-02)
// - endring av vilkårsmalen endrer ikke et allerede sendt tilbud (SD-04)
// - tilbud uten svar får automatisk påminnelse etter antall dager i regelen,
//   og påminnelsen stopper når kunden svarer (OP-03/OP-04)
// - en regel endret på ett tilbud påvirker ikke andre tilbud (OP-05)
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { encryptSecret } from '../../src/lib/secrets';
import { formatQuoteNumber, nextQuoteBaseNumber } from '../../src/modules/quotes/numbering';
import { runFollowUpCycle } from '../../src/modules/quotes/followup-worker';
import { prepareQuoteForSending } from '../../src/modules/quotes/send';
import { E2E_ADMIN, TEST_DATABASE_URL } from './global-setup';
import { loginAs } from './helpers';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: 'serial' });

test('privatkunde får automatisk vilkår for privatkunder, og senere malendring endrer ikke et sendt tilbud (TO-02, SD-04)', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN);

  // Kundegruppe "Privat".
  await page.goto('/customers/groups');
  await page.getByLabel('Navn').fill('Privat');
  await page.getByRole('button', { name: 'Opprett gruppe' }).click();

  // Generisk tilbudsmal (ingen kundegruppe).
  await page.goto('/admin/templates/new');
  await page.locator('select[name="type"]').selectOption('QUOTE');
  await page.getByLabel('Navn').fill('Standardvilkår');
  await page.locator('textarea[name="content"]').fill('GENERISK-VILKAR-XYZ');
  await page.locator('select[name="status"]').selectOption('PUBLISHED');
  await page.getByRole('button', { name: 'Opprett mal' }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+$/);

  // Tilbudsmal spesifikt for kundegruppen "Privat".
  await page.goto('/admin/templates/new');
  await page.locator('select[name="type"]').selectOption('QUOTE');
  await page.getByLabel('Navn').fill('Privatkundevilkår');
  await page.locator('select[name="customerGroupId"]').selectOption({ label: 'Privat' });
  await page.locator('textarea[name="content"]').fill('PRIVATKUNDE-VILKAR-XYZ');
  await page.locator('select[name="status"]').selectOption('PUBLISHED');
  await page.getByRole('button', { name: 'Opprett mal' }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+$/);
  const privatTemplateGroupId = page.url().split('/').pop()!;

  // Privatkunde, meldt inn i gruppen "Privat".
  await page.goto('/customers/new');
  await page.getByLabel('Privat', { exact: true }).check();
  const customerName = `E2E Privatkunde ${Date.now()}`;
  await page.getByLabel('Navn', { exact: true }).fill(customerName);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  const customerId = page.url().split('/').pop()!;

  const groupsForm = page.locator('form', { has: page.getByRole('button', { name: 'Lagre grupper' }) });
  await groupsForm.getByLabel('Privat', { exact: true }).check();
  await groupsForm.getByRole('button', { name: 'Lagre grupper' }).click();

  // Tilbud på privatkunden, med én fritekstlinje.
  await page.goto(`/quotes/new?customerId=${customerId}`);
  await page.getByRole('button', { name: 'Opprett tilbud' }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]+$/);
  const quoteId = page.url().split('/').pop()!;

  await page.getByPlaceholder('Beskrivelse').fill('Bord i marmor');
  await page.getByPlaceholder('Enhet (m², lm, stk)').fill('stk');
  await page.getByPlaceholder('Antall').fill('1');
  await page.getByPlaceholder('Pris').fill('10000');
  await page.getByRole('button', { name: 'Legg til linje' }).click();
  await expect(page.getByText('Bord i marmor')).toBeVisible();

  // Fryser innhold slik "Send tilbud"-handlingen gjør før den legger jobben
  // i sendekøen (selve SMTP-kallet skjer kun i workeren, arbeidsregel 12).
  await prepareQuoteForSending(quoteId);

  const sentQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  expect(sentQuote.termsSnapshot).toContain('PRIVATKUNDE-VILKAR-XYZ');
  expect(sentQuote.termsSnapshot).not.toContain('GENERISK-VILKAR-XYZ');

  // SD-04: en senere endring av malen skal ikke påvirke det allerede
  // forberedte/sendte tilbudet.
  await page.goto(`/admin/templates/${privatTemplateGroupId}`);
  await page.locator('textarea[name="content"]').fill('ENDRET-VILKAR-XYZ');
  await page.getByRole('button', { name: 'Lagre som ny versjon' }).click();
  await expect(page.getByText('Versjon 2 (gjeldende)')).toBeVisible();

  const quoteAfterTemplateChange = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  expect(quoteAfterTemplateChange.termsSnapshot).toContain('PRIVATKUNDE-VILKAR-XYZ');
  expect(quoteAfterTemplateChange.termsSnapshot).not.toContain('ENDRET-VILKAR-XYZ');
});

test('automatisk oppfølging etter regelen, stopper ved kundesvar, og en tilbudsspesifikk regel påvirker ikke andre tilbud (OP-03, OP-04, OP-05)', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN);

  const admin = await prisma.user.findFirstOrThrow({ where: { email: E2E_ADMIN.email } });

  const emailAccount = await prisma.emailAccount.create({
    data: {
      address: `oppfolging-${Date.now()}@pietraunica.test`,
      username: 'oppfolging',
      encryptedPassword: encryptSecret('dummy-passord'),
      imapHost: 'imap.example.invalid',
      smtpHost: 'smtp.example.invalid',
      shared: true,
      createdById: admin.id,
    },
  });

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  async function createSentQuote(customerEmail: string) {
    const customer = await prisma.customer.create({
      data: { type: 'PRIVATE', name: `E2E Oppfølging ${customerEmail}`, email: customerEmail, createdById: admin.id },
    });
    const baseNumber = await nextQuoteBaseNumber();
    const id = crypto.randomUUID();
    const quote = await prisma.quote.create({
      data: {
        id,
        groupId: id,
        customerId: customer.id,
        baseNumber,
        number: formatQuoteNumber(baseNumber, 1),
        revision: 1,
        isCurrent: true,
        status: 'SENT',
        totalMinor: 100_000,
        currency: 'NOK',
        sentAt: daysAgo(8),
        sentViaEmailAccountId: emailAccount.id,
        nextFollowUpAt: daysAgo(1),
        validUntil: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
    });
    return { customer, quote };
  }

  const { quote: quote1 } = await createSentQuote(`case1-${Date.now()}@example.invalid`);
  const { customer: customer2, quote: quote2 } = await createSentQuote(`case2-${Date.now()}@example.invalid`);

  // Standardregel: påminnelse etter 7 og 14 dager.
  await page.goto('/admin/followup-rules');
  await page.locator('input[name="daysSequence"]').first().fill('7,14');
  await page.locator('input[name="active"]').first().check();
  await page.getByRole('button', { name: 'Lagre standardregel' }).click();
  // Server-actionen navigerer ikke (kun revalidatePath) – vent på at
  // skrivingen faktisk er commitet før testen går videre og selv leser fra
  // samme database, ellers blir det en race mot den asynkrone fetch-en.
  await expect
    .poll(async () => prisma.followUpRule.findFirst({ where: { scope: 'DEFAULT' } }))
    .not.toBeNull();

  // Tilbud 2 får en egen regel (3 og 6 dager) direkte på tilbudet (OP-05).
  await page.goto(`/quotes/${quote2.id}`);
  await page.locator('input[name="daysSequence"]').fill('3,6');
  await page.locator('input[name="active"]').check();
  await page.getByRole('button', { name: 'Lagre regel for dette tilbudet' }).click();
  await expect
    .poll(async () => prisma.followUpRule.findUnique({ where: { quoteId: quote2.id } }))
    .not.toBeNull();

  const firstCycle = await runFollowUpCycle(now);
  expect(firstCycle.remindersSent).toBeGreaterThanOrEqual(2);

  const q1AfterFirst = await prisma.quote.findUniqueOrThrow({ where: { id: quote1.id } });
  const q2AfterFirst = await prisma.quote.findUniqueOrThrow({ where: { id: quote2.id } });

  expect(q1AfterFirst.followUpsSent).toBe(1);
  expect(q2AfterFirst.followUpsSent).toBe(1);
  // Ulik neste-dato beviser at tilbud 2 sin egen regel (3/6 dager) ikke er
  // påvirket av standardregelen (7/14 dager) som gjelder for tilbud 1, og
  // omvendt – en regel endret på ett tilbud påvirker ikke andre.
  expect(q1AfterFirst.nextFollowUpAt?.getTime()).not.toBe(q2AfterFirst.nextFollowUpAt?.getTime());

  // Kunden på tilbud 1 svarer på e-post.
  await prisma.emailMessage.create({
    data: {
      emailAccountId: emailAccount.id,
      folder: 'INBOX',
      uid: Math.floor(Math.random() * 1_000_000),
      direction: 'IN',
      fromAddress: (await prisma.customer.findUniqueOrThrow({ where: { id: q1AfterFirst.customerId } })).email!,
      toAddresses: [emailAccount.address],
      occurredAt: daysAgo(2),
      entityType: 'Customer',
      entityId: q1AfterFirst.customerId,
      subject: 'Svar på tilbud',
    },
  });
  // Simulerer at neste planlagte påminnelse for tilbud 1 har forfalt.
  await prisma.quote.update({ where: { id: quote1.id }, data: { nextFollowUpAt: daysAgo(1) } });

  await runFollowUpCycle(now);

  const q1AfterReply = await prisma.quote.findUniqueOrThrow({ where: { id: quote1.id } });
  expect(q1AfterReply.followUpsSent).toBe(1); // uendret – ingen ny påminnelse sendt
  expect(q1AfterReply.nextFollowUpAt).toBeNull(); // OP-04: oppfølging stoppet

  await prisma.task.deleteMany({ where: { entityType: 'Quote', entityId: { in: [quote1.id, quote2.id] } } });
  await prisma.activity.deleteMany({
    where: { entityId: { in: [q1AfterFirst.customerId, customer2.id] } },
  });
  await prisma.emailMessage.deleteMany({ where: { emailAccountId: emailAccount.id } });
  await prisma.followUpRule.deleteMany({ where: { OR: [{ scope: 'DEFAULT' }, { quoteId: quote2.id }] } });
  await prisma.quote.deleteMany({ where: { id: { in: [quote1.id, quote2.id] } } });
  await prisma.customer.deleteMany({ where: { id: { in: [q1AfterFirst.customerId, customer2.id] } } });
  await prisma.emailAccount.delete({ where: { id: emailAccount.id } });
});
