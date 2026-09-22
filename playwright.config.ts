import { existsSync } from 'node:fs';

import { defineConfig } from '@playwright/test';

import { TEST_DATABASE_URL, TEST_ENCRYPTION_KEY, TEST_STORAGE_DIR } from './tests/e2e/global-setup';

const PORT = 3100;

// M3: enkelte tester kaller applikasjonskode (f.eks. syncAccountFolder)
// direkte fra selve testprosessen, ikke bare via nettleseren mot webServer.
// Da må DENNE prosessen også peke på testdatabasen og bruke samme
// krypteringsnøkkel, satt her – før noe testfil rekker å importere '@/lib/db'.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

// Denne sandkasse-utviklingsmiljøet har en forhåndsinstallert Chromium på en
// fast sti i stedet for Playwrights vanlige nedlastingsbane. Faller tilbake
// til Playwrights egen (f.eks. i CI, etter `npx playwright install`) hvis
// den ikke finnes.
const SANDBOX_CHROMIUM_PATH = '/opt/pw-browsers/chromium';
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {},
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-test-secret-not-for-production',
      BACKUP_DIR: './data/backups-e2e',
      STORAGE_DIR: TEST_STORAGE_DIR,
      ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    },
  },
});
