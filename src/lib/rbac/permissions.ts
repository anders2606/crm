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
  EMAIL_ACCOUNTS_MANAGE: 'email.accounts.manage',
  MATERIAL_READ: 'material.read',
  MATERIAL_WRITE: 'material.write',
  QUOTE_READ: 'quote.read',
  QUOTE_WRITE: 'quote.write',
  ORDER_READ: 'order.read',
  ORDER_WRITE: 'order.write',
  // SD-02: sentralt malbibliotek (maler, tekstblokker, standard oppfølgingsregel)
  // administreres samlet, uten hjelp fra utvikler.
  TEMPLATE_MANAGE: 'template.manage',
  // IN-20/IN-23: tilkobling, nøkler og miljøvalg for PowerOffice – kun administrator.
  POWEROFFICE_MANAGE: 'poweroffice.manage',
  // LE-08: opplasting og manuell matching av kontoutskrift (reserve når
  // PowerOffice ikke har bokført betalingen ennå).
  BANK_IMPORT_MANAGE: 'bank.import.manage',
  // GR-01–07: opprette og sende gruppeutsendelser.
  CAMPAIGN_MANAGE: 'campaign.manage',
  // GE-10: salgs-/konverteringsrapporter og CSV-eksport.
  REPORTS_READ: 'reports.read',
  // GE-09: definere egendefinerte felt på kunder/leverandører/tilbud/ordre.
  CUSTOM_FIELDS_MANAGE: 'custom_fields.manage',
  // GE-11: opprette/tilbakekalle API-nøkler for det åpne REST-API-et.
  API_KEYS_MANAGE: 'api_keys.manage',
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
