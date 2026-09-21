// Mellomsteg mellom passord og 2FA-kode. Tokenet er signert (HMAC), ikke
// lagret i databasen, og gir bare tilgang til å fullføre innloggingen for
// nøyaktig én bruker i et kort tidsrom (GE-04).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/db';
import { PENDING_COOKIE_NAME, PENDING_TTL_MS } from '@/lib/auth/constants';
import { generateTotpSecret } from '@/lib/auth/totp';

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET mangler i miljøvariabler (.env)');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function createPendingToken(userId: string): { value: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
  const payload = `${userId}.${expiresAt.getTime()}`;
  return { value: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifyPendingToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [userId, expiresAtRaw, signature] = parts as [string, string, string];
  const expected = sign(`${userId}.${expiresAtRaw}`);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }
  return userId;
}

export interface PendingAuth {
  userId: string;
  email: string;
  name: string;
  needsEnrollment: boolean;
  totpSecret: string;
}

/** Leser `pu_pending`-cookien og henter brukeren den peker på, om gyldig. */
export async function getPendingAuth(): Promise<PendingAuth | null> {
  const token = cookies().get(PENDING_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const userId = verifyPendingToken(token);
  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) {
    return null;
  }

  if (user.totpEnabled && user.totpSecret) {
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      needsEnrollment: false,
      totpSecret: user.totpSecret,
    };
  }

  // Brukeren har ikke fullført 2FA-registrering ennå: generer en hemmelighet
  // (gjenbruk om et forsøk allerede er startet) og be om registrering før
  // pålogging kan fullføres.
  const secret = user.totpSecret ?? generateTotpSecret();
  if (!user.totpSecret) {
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  }
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    needsEnrollment: true,
    totpSecret: secret,
  };
}
