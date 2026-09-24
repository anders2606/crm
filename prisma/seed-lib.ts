// Gjenbrukbar rettighets-/rolle-/adminbruker-logikk, delt mellom
// `npm run db:seed` (prisma/seed.ts) og installasjonsveiviseren i M9
// (DR-13, se scripts/installer-tasks.ts). Denne filen har bevisst INGEN
// egen kjør-hvis-direkte-logikk: esbuild bundler denne filens innhold rett
// inn i installer-tasks.js når den importeres, og et
// `if (require.main === module)`-vern her ville da feilaktig blitt sant
// for HELE den bundlede filen og kjørt to ganger (observert som en reell
// krasj – to samtidige forsøk på å opprette de samme radene – under
// utvikling av veiviseren).
import type { PrismaClient, Role } from '@prisma/client';

import { hashPassword } from '../src/lib/auth/password';
import { PERMISSIONS } from '../src/lib/rbac/permissions';

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

/** GE-03: oppretter standardrettigheter og -roller (idempotent). Returnerer Administrator-rollen. */
export async function seedPermissionsAndRoles(prisma: PrismaClient): Promise<Role> {
  // createMany+skipDuplicates er atomisk (én spørring), i motsetning til en
  // løkke med individuelle upsert-kall – trygt selv om noe annet skulle
  // forsøke å sette opp rettighetene på nøyaktig samme tidspunkt.
  await prisma.permission.createMany({
    data: Object.values(PERMISSIONS).map((key) => ({ key })),
    skipDuplicates: true,
  });

  const allPermissions = await prisma.permission.findMany();

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

  return adminRole;
}

export interface AdminAccountInput {
  name: string;
  email: string;
  password: string;
}

/** Oppretter admin-brukeren hvis den ikke finnes fra før (idempotent, trygg å kalle på nytt). */
export async function createAdminUserIfMissing(
  prisma: PrismaClient,
  adminRole: Role,
  input: AdminAccountInput,
): Promise<{ created: boolean; email: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return { created: false, email: existing.email };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      roles: { create: { roleId: adminRole.id } },
    },
  });
  return { created: true, email: user.email };
}
