// I utvikling (arbeidsregel 5): oppretter standardrettigheter, to
// standardroller (Administrator/Selger, GE-03) og én admin-bruker med
// tilfeldig/dev-passord når kjørt direkte (`npm run db:seed`). Selve
// logikken ligger i seed-lib.ts – denne filen er kun CLI-inngangen, og
// importeres aldri av noe annet (installasjonsveiviseren i M9 bruker
// seed-lib.ts direkte). Se seed-lib.ts for hvorfor det skillet finnes.
import { createAdminUserIfMissing, seedPermissionsAndRoles } from './seed-lib';

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // Ingen .env til stede – variablene må da allerede være satt i prosessmiljøet.
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    console.log('Seeder rettigheter og roller...');
    const adminRole = await seedPermissionsAndRoles(prisma);

    const seedEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@pietraunica.test';
    const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? 'endre-meg-1234';
    const seedName = process.env.SEED_ADMIN_NAME ?? 'Administrator';

    const result = await createAdminUserIfMissing(prisma, adminRole, {
      name: seedName,
      email: seedEmail,
      password: seedPassword,
    });
    if (result.created) {
      console.log(`Admin-bruker opprettet: ${result.email} / passord: ${seedPassword}`);
      console.log('To-faktor settes opp ved første innlogging.');
    } else {
      console.log(`Admin-bruker finnes allerede: ${result.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
