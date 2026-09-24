// DR-13: kjøres av installasjonsveiviseren (electron/src/wizard) etter at
// databasen er migrert. Leser oppsettet veiviseren samlet inn (JSON-fil,
// se argv[1]) og gjenbruker samme rettighets-/rolleoppsett og
// adminbruker-opprettelse som `npm run db:seed` (prisma/seed-lib.ts), men
// med ekte innlagte verdier i stedet for miljøvariabler/dev-standardverdier.
// Importerer bevisst fra seed-lib.ts (ikke seed.ts): esbuild bundler denne
// filens avhengigheter direkte inn i installer-tasks.js, og seed.ts sin
// egen CLI-main() ville da blitt inkludert og kjørt som en utilsiktet
// bieffekt av bundlingen.
import { readFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';

import { createAdminUserIfMissing, seedPermissionsAndRoles } from '../prisma/seed-lib';
import { encryptSecret } from '../src/lib/secrets';

interface InstallerInput {
  admin: {
    name: string;
    email: string;
    password: string;
  };
  poweroffice?: {
    environment: 'DEMO' | 'PRODUCTION';
    applicationKey?: string;
    clientKey?: string;
    subscriptionKey?: string;
    invoiceReceiptEmail?: string;
  };
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Mangler sti til oppsett-JSON som argument');
  }
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as InstallerInput;

  const prisma = new PrismaClient();
  try {
    const adminRole = await seedPermissionsAndRoles(prisma);
    const result = await createAdminUserIfMissing(prisma, adminRole, input.admin);
    console.log(result.created ? `Admin-bruker opprettet: ${result.email}` : `Admin-bruker finnes allerede: ${result.email}`);

    if (input.poweroffice) {
      const po = input.poweroffice;
      await prisma.powerOfficeSettings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          environment: po.environment,
          encryptedApplicationKey: po.applicationKey ? encryptSecret(po.applicationKey) : null,
          encryptedClientKey: po.clientKey ? encryptSecret(po.clientKey) : null,
          encryptedSubscriptionKey: po.subscriptionKey ? encryptSecret(po.subscriptionKey) : null,
          invoiceReceiptEmail: po.invoiceReceiptEmail ?? null,
        },
        update: {
          environment: po.environment,
          ...(po.applicationKey ? { encryptedApplicationKey: encryptSecret(po.applicationKey) } : {}),
          ...(po.clientKey ? { encryptedClientKey: encryptSecret(po.clientKey) } : {}),
          ...(po.subscriptionKey ? { encryptedSubscriptionKey: encryptSecret(po.subscriptionKey) } : {}),
          ...(po.invoiceReceiptEmail ? { invoiceReceiptEmail: po.invoiceReceiptEmail } : {}),
        },
      });
      console.log('PowerOffice-nøkler lagret.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
