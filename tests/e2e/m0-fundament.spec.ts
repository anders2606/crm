// Dekker akseptansekriteriene for M0 (kravspesifikasjon kap. 19):
// - en bruker uten gyldig 2FA kommer ikke inn
// - en selger kan ikke åpne administrasjonssider
// - administrator kan opprette en ny rolle med valgte rettigheter uten kodeendring
// - hver endring gir en rad i AuditLog med før/etter-verdi
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { generateTotp } from '../../src/lib/auth/totp';
import { E2E_ADMIN, E2E_SELGER, TEST_DATABASE_URL } from './global-setup';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function submitCredentials(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-post').fill(email);
  await page.getByLabel('Passord').fill(password);
  await page.getByRole('button', { name: 'Logg inn' }).click();
}

async function loginAs(page: Page, creds: { email: string; password: string; totpSecret: string }) {
  await submitCredentials(page, creds.email, creds.password);
  await page.getByLabel('6-sifret kode').fill(generateTotp(creds.totpSecret));
  await page.getByRole('button', { name: 'Bekreft' }).click();
  // Innlogging skjer via en server action (fetch + klientnavigasjon), ikke en
  // vanlig skjemainnsending – vent eksplisitt på at dashbordet er lastet før
  // testen går videre, ellers kan neste steg treffe serveren før sesjonen er satt.
  await page.waitForURL('/');
}

test('feil passord slipper ikke brukeren inn', async ({ page }) => {
  await submitCredentials(page, E2E_ADMIN.email, 'feil-passord');
  await expect(page.getByText('Feil e-post eller passord.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('bruker uten gyldig 2FA-kode kommer ikke inn', async ({ page }) => {
  await submitCredentials(page, E2E_ADMIN.email, E2E_ADMIN.password);
  const validCode = generateTotp(E2E_ADMIN.totpSecret);
  const wrongCode = validCode === '000000' ? '111111' : '000000';

  await page.getByLabel('6-sifret kode').fill(wrongCode);
  await page.getByRole('button', { name: 'Bekreft' }).click();

  await expect(page.getByText('Feil kode. Prøv igjen.')).toBeVisible();

  // Fortsatt ingen sesjon: dashbordet skal omdirigere til innlogging.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('riktig passord og 2FA-kode logger inn', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);
  await expect(page).toHaveURL('/');
  await expect(page.getByText(`Innlogget som ${'E2E Administrator'}`)).toBeVisible();
});

test('en selger kan ikke åpne administrasjonssider', async ({ page }) => {
  await loginAs(page, E2E_SELGER);
  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Ingen tilgang' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Roller og rettigheter' })).toHaveCount(0);
});

test('administrator oppretter en ny rolle med valgte rettigheter uten kodeendring, og det logges i AuditLog', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN);
  await page.goto('/admin/roles');

  const roleName = `E2E-testrolle-${Date.now()}`;
  const createForm = page.getByTestId('create-role-form');
  await createForm.getByLabel('Navn').fill(roleName);
  await createForm.getByLabel('supplier.read').check();
  await createForm.getByRole('button', { name: 'Opprett rolle' }).click();
  await expect(page.getByRole('heading', { name: roleName })).toBeVisible();

  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const auditRow = await prisma.auditLog.findFirst({
    where: { entityType: 'Role', entityId: role.id, action: 'create' },
    orderBy: { createdAt: 'desc' },
  });

  expect(auditRow).not.toBeNull();
  expect(auditRow?.userId).not.toBeNull();
  expect(auditRow?.after).toMatchObject({ name: roleName });
});
