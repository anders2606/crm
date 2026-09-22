// EP-02: automatisk kobling av e-post til kunde/leverandør. Eksakt
// e-postadresse først, deretter domene – men ikke for store, offentlige
// webmail-domener (kap. 18).
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';

export interface EntityMatch {
  entityType: string;
  entityId: string;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'msn.com',
]);

function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

/** Prøver å finne kunden eller leverandøren en eller flere e-postadresser tilhører. */
export async function findEntityForAddresses(addresses: string[]): Promise<EntityMatch | null> {
  const normalized = Array.from(
    new Set(addresses.map((address) => address.trim().toLowerCase()).filter(Boolean)),
  );
  if (normalized.length === 0) {
    return null;
  }

  const [customerByEmail, supplierByEmail, contactByEmail] = await Promise.all([
    prisma.customer.findFirst({
      where: { deletedAt: null, email: { in: normalized, mode: 'insensitive' } },
    }),
    prisma.supplier.findFirst({
      where: { deletedAt: null, email: { in: normalized, mode: 'insensitive' } },
    }),
    prisma.contactPerson.findFirst({
      where: { email: { in: normalized, mode: 'insensitive' } },
    }),
  ]);

  if (customerByEmail) {
    return { entityType: ENTITY_TYPES.CUSTOMER, entityId: customerByEmail.id };
  }
  if (supplierByEmail) {
    return { entityType: ENTITY_TYPES.SUPPLIER, entityId: supplierByEmail.id };
  }
  if (contactByEmail?.customerId) {
    return { entityType: ENTITY_TYPES.CUSTOMER, entityId: contactByEmail.customerId };
  }
  if (contactByEmail?.supplierId) {
    return { entityType: ENTITY_TYPES.SUPPLIER, entityId: contactByEmail.supplierId };
  }

  const domains = Array.from(
    new Set(
      normalized
        .map(domainOf)
        .filter((domain): domain is string => domain !== null && !PUBLIC_EMAIL_DOMAINS.has(domain)),
    ),
  );

  for (const domain of domains) {
    const suffix = `@${domain}`;
    const customerByDomain = await prisma.customer.findFirst({
      where: { deletedAt: null, email: { endsWith: suffix, mode: 'insensitive' } },
    });
    if (customerByDomain) {
      return { entityType: ENTITY_TYPES.CUSTOMER, entityId: customerByDomain.id };
    }

    const supplierByDomain = await prisma.supplier.findFirst({
      where: { deletedAt: null, email: { endsWith: suffix, mode: 'insensitive' } },
    });
    if (supplierByDomain) {
      return { entityType: ENTITY_TYPES.SUPPLIER, entityId: supplierByDomain.id };
    }
  }

  return null;
}
