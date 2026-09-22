// Dekker akseptansekriteriene for M4 (kravspesifikasjon kap. 19):
// - registrering av ny innkjøpspris i EUR lagrer både EUR og NOK med kursdato
// - prisgrafen viser alle prispunkter for materialet
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { resetMockRates, seedMockRates } from '../../src/integrations/exchange-rates';
import { syncExchangeRates } from '../../src/modules/exchange-rates/service';
import { E2E_ADMIN, TEST_DATABASE_URL } from './global-setup';
import { loginAs } from './helpers';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: 'serial' });

test('registrering av ny innkjøpspris i EUR lagrer både EUR og NOK med kursdato (MA-03)', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  resetMockRates();
  const priceDate = '2026-06-15';
  seedMockRates('EUR', [{ currency: 'EUR', date: priceDate, rate: 11.5 }]);
  const synced = await syncExchangeRates('EUR', new Date(priceDate), new Date(priceDate));
  expect(synced).toBe(1);

  const materialName = `E2E Marmor ${Date.now()}`;
  await page.goto('/materials/new');
  await page.getByLabel('Navn', { exact: true }).fill(materialName);
  await page.getByRole('button', { name: 'Opprett materiale' }).click();
  await expect(page).toHaveURL(/\/materials\/[0-9a-f-]+$/);
  const materialId = page.url().split('/').pop()!;

  const priceForm = page.locator('form', { has: page.getByRole('button', { name: 'Registrer pris' }) });
  await priceForm.locator('select[name="type"]').selectOption('PURCHASE');
  await priceForm.locator('input[name="priceDate"]').fill(priceDate);
  await priceForm.locator('input[name="amount"]').fill('100,00');
  await priceForm.locator('input[name="currency"]').fill('EUR');
  await priceForm.getByRole('button', { name: 'Registrer pris' }).click();

  await expect(page.getByText(/100,00\s*EUR/)).toBeVisible();
  await expect(page.getByText(/1.150,00\s*NOK/)).toBeVisible();

  const entry = await prisma.priceEntry.findFirstOrThrow({ where: { materialId, currency: 'EUR' } });
  expect(entry.amountMinor).toBe(10_000);
  expect(entry.amountNokMinor).toBe(115_000);
});

test('prisgrafen viser alle prispunkter for materialet (MA-04)', async ({ page }) => {
  await loginAs(page, E2E_ADMIN);

  const materialName = `E2E Prisgraf ${Date.now()}`;
  await page.goto('/materials/new');
  await page.getByLabel('Navn', { exact: true }).fill(materialName);
  await page.getByRole('button', { name: 'Opprett materiale' }).click();
  await expect(page).toHaveURL(/\/materials\/[0-9a-f-]+$/);

  const priceForm = page.locator('form', { has: page.getByRole('button', { name: 'Registrer pris' }) });
  const salePrices = [
    { date: '2026-01-01', amount: '800,00' },
    { date: '2026-03-01', amount: '850,00' },
    { date: '2026-06-01', amount: '900,00' },
  ];

  for (const entry of salePrices) {
    await priceForm.locator('select[name="type"]').selectOption('SALE');
    await priceForm.locator('input[name="priceDate"]').fill(entry.date);
    await priceForm.locator('input[name="amount"]').fill(entry.amount);
    await priceForm.locator('input[name="currency"]').fill('NOK');
    await priceForm.getByRole('button', { name: 'Registrer pris' }).click();
    await expect(page.getByText(new RegExp(`${entry.amount.replace(',', ',')}\\s*NOK`)).first()).toBeVisible();
  }

  const chartPath = page.locator('svg path');
  await expect(chartPath).toBeVisible();
  const d = await chartPath.getAttribute('d');
  // Tre datapunkter -> ett "M"-startpunkt pluss to " L "-segmenter = tre deler.
  expect(d?.split(' L ').length).toBe(3);
});
