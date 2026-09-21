// Dekker akseptansekriteriene for M1 (kravspesifikasjon kap. 19):
// - registrering av et eksisterende org.nr. gir duplikatvarsel (KU-10)
// - systemet kan tas i bruk med tomme registre, uten import (KU-12)
// - tidslinjen viser aktiviteter nyeste først (KU-06)
// - felles søk finner en nyopprettet kunde (GE-05, foreløpig kunder/leverandører)
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { E2E_ADMIN, TEST_DATABASE_URL } from './global-setup';
import { loginAs } from './helpers';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: 'serial' });

test('tomt register: kundelisten kan brukes uten import (KU-12)', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);
  await page.goto('/customers');
  await expect(page.getByText(/Ingen kunder funnet/)).toBeVisible();
});

test('registrering av et eksisterende org.nr. gir duplikatvarsel (KU-10)', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  const orgNr = `9${Date.now().toString().slice(-8)}`;
  const firstName = `E2E Kunde ${Date.now()}`;

  await page.goto('/customers/new');
  await page.getByLabel('Navn').fill(firstName);
  await page.getByLabel('Organisasjonsnummer').fill(orgNr);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);

  // Forsøk å registrere en ny kunde med samme org.nr., men annet navn.
  await page.goto('/customers/new');
  await page.getByLabel('Navn').fill(`${firstName} (duplikat)`);
  await page.getByLabel('Organisasjonsnummer').fill(orgNr);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();

  await expect(page.getByText('Mulig duplikat funnet (KU-10):')).toBeVisible();
  await expect(page.getByText(firstName, { exact: false })).toBeVisible();

  // Selgeren bekrefter og oppretter likevel.
  await page.getByRole('button', { name: 'Opprett likevel' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);

  const customersWithOrgNr = await prisma.customer.count({ where: { orgNr } });
  expect(customersWithOrgNr).toBe(2);
});

test('tidslinjen på en kunde viser aktiviteter nyeste først (KU-06)', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  await page.goto('/customers/new');
  const name = `E2E Tidslinje ${Date.now()}`;
  await page.getByLabel('Navn').fill(name);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);

  const timelineForm = page.locator('form', { has: page.getByPlaceholder('Hva ble sagt/gjort?') });

  await timelineForm.getByPlaceholder('Hva ble sagt/gjort?').fill('Første notat');
  await timelineForm.getByRole('button', { name: 'Registrer' }).click();
  await expect(page.getByText('Første notat')).toBeVisible();

  await timelineForm.getByPlaceholder('Hva ble sagt/gjort?').fill('Andre notat');
  await timelineForm.getByRole('button', { name: 'Registrer' }).click();
  await expect(page.getByText('Andre notat')).toBeVisible();

  const timelineEntries = page
    .locator('section', { has: page.getByRole('heading', { name: 'Tidslinje' }) })
    .locator('li');
  await expect(timelineEntries.nth(0)).toContainText('Andre notat');
  await expect(timelineEntries.nth(1)).toContainText('Første notat');
  await expect(timelineEntries.nth(2)).toContainText('Kunde opprettet');
});

test('felles søk finner en nyopprettet kunde (GE-05)', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  const name = `E2E Søkbar Kunde ${Date.now()}`;
  await page.goto('/customers/new');
  await page.getByLabel('Navn').fill(name);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);

  await page.goto(`/search?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole('link', { name })).toBeVisible();
});
