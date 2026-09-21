// Nullstiller og reseeder en egen testdatabase (aldri utviklings- eller
// produksjonsdata, arbeidsregel 5) før Playwright-testene kjører.
import { execSync } from 'node:child_process';

import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../../src/lib/auth/password';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://pietra:pietra@localhost:5432/pietra_unica_crm_test';

export const E2E_ADMIN = {
  email: 'e2e-admin@pietraunica.test',
  password: 'e2e-admin-passord-123',
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
};

export const E2E_SELGER = {
  email: 'e2e-selger@pietraunica.test',
  password: 'e2e-selger-passord-123',
  totpSecret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU',
};

export default async function globalSetup(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

  try {
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();

    const permissionKeys = [
      'admin.roles.manage',
      'admin.users.manage',
      'customer.read',
      'customer.write',
      'supplier.read',
      'supplier.write',
    ];
    const permissions = await Promise.all(
      permissionKeys.map((key) => prisma.permission.create({ data: { key } })),
    );

    const adminRole = await prisma.role.create({
      data: {
        name: 'Administrator',
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
    });

    const selgerRole = await prisma.role.create({
      data: {
        name: 'Selger',
        permissions: {
          create: permissions
            .filter((permission) => permission.key.startsWith('customer.') || permission.key === 'supplier.read')
            .map((permission) => ({ permissionId: permission.id })),
        },
      },
    });

    await prisma.user.create({
      data: {
        name: 'E2E Administrator',
        email: E2E_ADMIN.email,
        passwordHash: await hashPassword(E2E_ADMIN.password),
        totpSecret: E2E_ADMIN.totpSecret,
        totpEnabled: true,
        roles: { create: { roleId: adminRole.id } },
      },
    });

    await prisma.user.create({
      data: {
        name: 'E2E Selger',
        email: E2E_SELGER.email,
        passwordHash: await hashPassword(E2E_SELGER.password),
        totpSecret: E2E_SELGER.totpSecret,
        totpEnabled: true,
        roles: { create: { roleId: selgerRole.id } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
