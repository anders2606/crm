// Dekker akseptansekriteriene for M2 (kravspesifikasjon kap. 19):
// - en PDF på 50 MB lastes opp og forhåndsvises
// - ny versjon av en tegning gjør forrige versjon ikke-gjeldende, men den kan fortsatt åpnes
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { E2E_ADMIN } from './global-setup';
import { loginAs } from './helpers';

test.describe.configure({ mode: 'serial' });

async function createCustomer(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.goto('/customers/new');
  await page.getByLabel('Navn').fill(name);
  await page.getByRole('button', { name: 'Opprett kunde' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
}

test('en PDF på 50 MB lastes opp og forhåndsvises', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page, E2E_ADMIN);
  await createCustomer(page, `E2E Stor PDF ${Date.now()}`);

  const fiftyMb = 50 * 1024 * 1024;
  // Innholdet er vilkårlige byte – M2 validerer ikke PDF-struktur, kun
  // filnavn/MIME-type, og at hele filen lagres og kan hentes ut igjen uskadd.
  // Playwright avviser buffere over ~50 MB satt direkte i minnet, så filen
  // skrives til disk og lastes opp derfra (som i en ekte nettleser).
  const tempDir = await mkdtemp(path.join(tmpdir(), 'pu-e2e-upload-'));
  const tempFilePath = path.join(tempDir, 'stor-tegning.pdf');
  await writeFile(tempFilePath, Buffer.alloc(fiftyMb, 65));

  try {
    const uploadForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Last opp', exact: true }) });
    await uploadForm.locator('input[type="file"]').setInputFiles(tempFilePath);
    await uploadForm.getByRole('button', { name: 'Last opp', exact: true }).click();

    await expect(page.getByText('stor-tegning.pdf')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/50\.0 MB/)).toBeVisible();

    const preview = page.locator('embed[type="application/pdf"]');
    await expect(preview).toBeVisible();
    const src = await preview.getAttribute('src');
    expect(src).toBeTruthy();

    const response = await page.request.get(src!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(Number(response.headers()['content-length'])).toBe(fiftyMb);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('ny versjon av en tegning gjør forrige versjon ikke-gjeldende, men den kan fortsatt åpnes', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN);
  await createCustomer(page, `E2E Versjonering ${Date.now()}`);

  const uploadForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Last opp', exact: true }) });
  await uploadForm.locator('select[name="category"]').selectOption('DRAWING');
  await uploadForm.locator('input[type="file"]').setInputFiles({
    name: 'benkeplate-rev-a.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('revisjon A'),
  });
  await uploadForm.getByRole('button', { name: 'Last opp', exact: true }).click();

  await expect(page.getByText('benkeplate-rev-a.pdf')).toBeVisible();
  await expect(page.getByText('v1 (gjeldende)', { exact: false })).toBeVisible();

  await page.locator('summary').filter({ hasText: 'Last opp ny versjon' }).click();
  const versionForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Last opp ny versjon' }) });
  await versionForm.locator('input[type="file"]').setInputFiles({
    name: 'benkeplate-rev-b.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('revisjon B'),
  });
  await versionForm.getByRole('button', { name: 'Last opp ny versjon' }).click();

  await expect(page.getByText('benkeplate-rev-b.pdf')).toBeVisible();
  await expect(page.getByText('v2 (gjeldende)', { exact: false })).toBeVisible();

  // Forrige versjon er ikke lenger gjeldende, men skal fortsatt kunne åpnes.
  await page.locator('summary').filter({ hasText: 'Tidligere versjoner' }).click();
  const previousLink = page.getByRole('link', { name: /benkeplate-rev-a\.pdf/ });
  await expect(previousLink).toBeVisible();

  const href = await previousLink.getAttribute('href');
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
});
