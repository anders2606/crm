// Dekker akseptansekriteriene for M3 (kravspesifikasjon kap. 19):
// - en e-post fra en kjent kundeadresse dukker opp på kundens tidslinje innen 2 minutter
// - samme e-post synkronisert to ganger gir én rad
// - e-post sendt fra CRM arkiveres (Sendt-mappen)
//
// Bruker mock-e-postintegrasjonen (arbeidsregel 5: ingen tester rører ekte
// postbokser). syncAccountFolder/sendAndArchive kalles direkte fra denne
// testprosessen, som er satt opp (playwright.config.ts) til å peke på samme
// testdatabase som webServer, slik at resultatet er synlig i nettleseren.
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { getMailClient, getMockSentLog, resetMockMail, seedMockMailbox } from '../../src/integrations/mail';
import { encryptSecret } from '../../src/lib/secrets';
import { syncAccountFolder } from '../../src/modules/email/sync';
import { E2E_ADMIN, TEST_DATABASE_URL } from './global-setup';
import { loginAs } from './helpers';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: 'serial' });

async function createTestAccount() {
  return prisma.emailAccount.create({
    data: {
      address: `test-${randomUUID()}@pietraunica.no`,
      username: 'test',
      encryptedPassword: encryptSecret('kun-mock-passordet-brukes-aldri'),
      imapHost: 'imap.example.test',
      smtpHost: 'smtp.example.test',
    },
  });
}

test('e-post fra en kjent kundeadresse dukker opp på kundens tidslinje, og resynk gir ingen duplikat', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN);

  const customerEmail = `kunde-${Date.now()}@m3-test.no`;
  const customerName = `E2E E-postkunde ${Date.now()}`;
  await page.goto('/customers/new');
  await page.getByLabel('Navn').fill(customerName);
  await page.getByLabel('E-post').fill(customerEmail);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  const customerId = page.url().split('/').pop()!;

  resetMockMail();
  const account = await createTestAccount();

  seedMockMailbox(account.address, 'INBOX', [
    {
      uid: 1,
      messageId: `<${randomUUID()}@m3-test.no>`,
      inReplyTo: null,
      fromAddress: customerEmail,
      fromName: customerName,
      toAddresses: [account.address],
      ccAddresses: [],
      subject: 'Forespørsel om benkeplate',
      textBody: 'Hei, jeg lurer på pris på en benkeplate i Carrara-marmor.',
      occurredAt: new Date(),
      attachments: [],
    },
  ]);

  const storedCount = await syncAccountFolder(account, 'INBOX');
  expect(storedCount).toBe(1);

  // Resynkronisering av samme mappe (samme UID) skal ikke gi en ny rad.
  const storedAgain = await syncAccountFolder(account, 'INBOX');
  expect(storedAgain).toBe(0);

  const messageCount = await prisma.emailMessage.count({ where: { emailAccountId: account.id } });
  expect(messageCount).toBe(1);

  const stored = await prisma.emailMessage.findFirstOrThrow({ where: { emailAccountId: account.id } });
  expect(stored.entityType).toBe('Customer');
  expect(stored.entityId).toBe(customerId);

  await page.goto(`/customers/${customerId}`);
  await expect(page.getByText('E-post: Forespørsel om benkeplate')).toBeVisible();
});

test('e-post sendt fra CRM arkiveres i Sendt-mappen', async () => {
  resetMockMail();
  const account = await createTestAccount();
  const client = getMailClient();

  const result = await client.sendAndArchive(
    {
      address: account.address,
      username: account.username,
      password: 'kun-mock-passordet-brukes-aldri',
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
    },
    { to: ['mottaker@example.test'], subject: 'Tilbud T-10001', text: 'Se vedlagt tilbud.' },
  );

  expect(result.messageId).toBeTruthy();
  const sentLog = getMockSentLog();
  expect(sentLog.some((entry) => entry.address === account.address && entry.message.subject === 'Tilbud T-10001')).toBe(
    true,
  );
});
