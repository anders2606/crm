// Ingen avhengigheter her (Prisma/'next/headers') – filen importeres også fra
// middleware.ts, som kjører i Edge-runtime uten Node/Prisma-støtte.
export const SESSION_COOKIE_NAME = 'pu_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 timer

export const PENDING_COOKIE_NAME = 'pu_pending';
export const PENDING_TTL_MS = 1000 * 60 * 5; // 5 minutter for å fullføre 2FA-steget
