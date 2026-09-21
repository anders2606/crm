import type { Page } from '@playwright/test';

import { generateTotp } from '../../src/lib/auth/totp';

export async function submitCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-post').fill(email);
  await page.getByLabel('Passord').fill(password);
  await page.getByRole('button', { name: 'Logg inn' }).click();
}

export async function loginAs(
  page: Page,
  creds: { email: string; password: string; totpSecret: string },
): Promise<void> {
  await submitCredentials(page, creds.email, creds.password);
  await page.getByLabel('6-sifret kode').fill(generateTotp(creds.totpSecret));
  await page.getByRole('button', { name: 'Bekreft' }).click();
  // Innlogging skjer via en server action (fetch + klientnavigasjon), ikke en
  // vanlig skjemainnsending – vent eksplisitt på at dashbordet er lastet før
  // testen går videre.
  await page.waitForURL('/');
}
