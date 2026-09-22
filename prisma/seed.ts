// Kun for utvikling (arbeidsregel 5): oppretter standardrettigheter, to
// standardroller (Administrator/Selger, GE-03) og én admin-bruker med
// tilfeldig/dev-passord. Ingen ekte data eller nøkler her.
import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/lib/auth/password';
import { PERMISSIONS } from '../src/lib/rbac/permissions';

try {
  process.loadEnvFile();
} catch {
  // Ingen .env til stede – variablene må da allerede være satt i prosessmiljøet.
}

const prisma = new PrismaClient();

const SELGER_PERMISSIONS: string[] = [
  PERMISSIONS.CUSTOMER_READ,
  PERMISSIONS.CUSTOMER_WRITE,
  PERMISSIONS.SUPPLIER_READ,
  PERMISSIONS.MATERIAL_READ,
  PERMISSIONS.MATERIAL_WRITE,
  PERMISSIONS.QUOTE_READ,
  PERMISSIONS.QUOTE_WRITE,
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.ORDER_WRITE,
];

async function main(): Promise<void> {
  console.log('Seeder rettigheter...');
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const allPermissions = await prisma.permission.findMany();

  console.log('Seeder roller...');
  const adminRole = await prisma.role.upsert({
    where: { name: 'Administrator' },
    update: {},
    create: {
      name: 'Administrator',
      description: 'Full tilgang til alle deler av systemet.',
      permissions: {
        create: allPermissions.map((permission) => ({ permissionId: permission.id })),
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'Selger' },
    update: {},
    create: {
      name: 'Selger',
      description: 'Kunder og leverandører, ingen administrasjon.',
      permissions: {
        create: allPermissions
          .filter((permission) => SELGER_PERMISSIONS.includes(permission.key))
          .map((permission) => ({ permissionId: permission.id })),
      },
    },
  });

  const seedEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@pietraunica.test';
  const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? 'endre-meg-1234';
  const seedName = process.env.SEED_ADMIN_NAME ?? 'Administrator';

  const existing = await prisma.user.findUnique({ where: { email: seedEmail } });
  if (!existing) {
    console.log('Oppretter admin-bruker...');
    const passwordHash = await hashPassword(seedPassword);
    const user = await prisma.user.create({
      data: {
        name: seedName,
        email: seedEmail,
        passwordHash,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    console.log(`Admin-bruker opprettet: ${user.email} / passord: ${seedPassword}`);
    console.log('To-faktor settes opp ved første innlogging.');
  } else {
    console.log(`Admin-bruker finnes allerede: ${existing.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
