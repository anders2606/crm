// GE-11: nøkkelbasert autentisering for det åpne REST-API-et (kun ment for
// en fremtidig nettbutikk på marmor.no, ikke åpent for øvrig – arbeidsregel
// 11/DR-15 avgjør faktisk nettverkseksponering, ikke denne modulen).
// Nøkkelen har høy entropi og lagres kun som SHA-256-hash – samme
// "vis kun én gang ved opprettelse"-mønster som passord, men uten saltet
// hash-kostnad siden nøkkelen selv er uforutsigbar (se ApiKey i schema).
import { createHash, randomBytes } from 'node:crypto';

import type { ApiKey } from '@prisma/client';

import { prisma } from '@/lib/db';

const KEY_PREFIX = 'pu_';

/** Kort levetid i en httpOnly-cookie fremfor en spørrestreng ved opprettelse (se admin/api-keys/actions.ts). */
export const NEW_API_KEY_COOKIE = 'flash_new_api_key';

export const API_SCOPES = {
  MATERIALS_READ: 'materials:read',
  CUSTOMERS_WRITE: 'customers:write',
  ORDERS_WRITE: 'orders:write',
} as const;

export const API_SCOPE_LABELS: Record<string, string> = {
  [API_SCOPES.MATERIALS_READ]: 'Lese materialer/priser/lagerstatus',
  [API_SCOPES.CUSTOMERS_WRITE]: 'Opprette kunder',
  [API_SCOPES.ORDERS_WRITE]: 'Opprette ordre',
};

export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Verifiserer nøkkelen og oppdaterer lastUsedAt. Returnerer null hvis ugyldig/inaktiv. */
export async function verifyApiKey(key: string): Promise<ApiKey | null> {
  const hashedKey = hashApiKey(key);
  const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey } });
  if (!apiKey || !apiKey.active) {
    return null;
  }
  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
  return apiKey;
}
