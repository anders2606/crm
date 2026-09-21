// Rettigheter sjekkes på serveren i hver server action og API-rute (GE-03, arbeidsregel 8).
// Administrator kan opprette nye rettighetsnøkler via admin/roller uten kodeendring;
// nøklene under er kun forhåndsdefinerte for kjernefunksjoner i M0/M1.
import { getSession, type SessionUser } from '@/lib/auth/session';

export const PERMISSIONS = {
  ADMIN_ROLES_MANAGE: 'admin.roles.manage',
  ADMIN_USERS_MANAGE: 'admin.users.manage',
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_WRITE: 'customer.write',
  SUPPLIER_READ: 'supplier.read',
  SUPPLIER_WRITE: 'supplier.write',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | (string & {});

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Ikke innlogget');
    this.name = 'AuthenticationRequiredError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(public readonly permission: string) {
    super(`Mangler rettighet: ${permission}`);
    this.name = 'PermissionDeniedError';
  }
}

export function hasPermission(session: SessionUser | null, permission: PermissionKey): boolean {
  return session !== null && session.permissions.includes(permission);
}

/**
 * Henter innlogget bruker og krever en gitt rettighet. Kastes fra hver
 * server action / API-rute som endrer eller viser beskyttet data – aldri kun
 * sjekket i grensesnittet.
 */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new AuthenticationRequiredError();
  }
  if (!hasPermission(session, permission)) {
    throw new PermissionDeniedError(permission);
  }
  return session;
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new AuthenticationRequiredError();
  }
  return session;
}
