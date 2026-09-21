// Sesjoner lagres i databasen (ikke JWT), slik at de kan avsluttes umiddelbart
// (f.eks. ved deaktivering av bruker) og vises i et driftsdashbord senere (IF-08).
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/db';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@/lib/auth/constants';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<string> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      id,
      userId,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  cookies().set(SESSION_COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return id;
}

export async function destroySession(): Promise<void> {
  const id = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (id) {
    await prisma.session.deleteMany({ where: { id } });
  }
  cookies().delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const id = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!id) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt.getTime() < Date.now() || !session.user.active) {
    return null;
  }

  const roles = session.user.roles.map((userRole) => userRole.role.name);
  const permissions = Array.from(
    new Set(
      session.user.roles.flatMap((userRole) =>
        userRole.role.permissions.map((rolePermission) => rolePermission.permission.key),
      ),
    ),
  );

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    roles,
    permissions,
  };
}
