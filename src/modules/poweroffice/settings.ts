// IN-23: miljøvalg og nøkler settes i administrasjonen (/admin/poweroffice),
// ikke i .env. Denne modulen leser den ene innstillingsraden og dekrypterer
// nøklene til en ferdig PowerOfficeCredentials, klar til getPowerOfficeClient().
import type { PowerOfficeSettings } from '@prisma/client';

import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/secrets';
import type { PowerOfficeCredentials } from '@/integrations/poweroffice';

const SETTINGS_ID = 'singleton';

export async function getPowerOfficeSettings(): Promise<PowerOfficeSettings | null> {
  return prisma.powerOfficeSettings.findUnique({ where: { id: SETTINGS_ID } });
}

/** Returnerer `null` når PowerOffice ikke er satt opp (mangler nøkler) ennå. */
export async function getPowerOfficeCredentials(): Promise<PowerOfficeCredentials | null> {
  const settings = await getPowerOfficeSettings();
  if (
    !settings ||
    !settings.encryptedApplicationKey ||
    !settings.encryptedClientKey ||
    !settings.encryptedSubscriptionKey
  ) {
    return null;
  }

  return {
    environment: settings.environment,
    applicationKey: decryptSecret(settings.encryptedApplicationKey),
    clientKey: decryptSecret(settings.encryptedClientKey),
    subscriptionKey: decryptSecret(settings.encryptedSubscriptionKey),
    apiBaseUrlOverride: settings.apiBaseUrlOverride,
    tokenUrlOverride: settings.tokenUrlOverride,
  };
}

/** IN-23: skriving er alltid av inntil administrator eksplisitt har slått den på. */
export async function isPowerOfficeWriteEnabled(): Promise<boolean> {
  const settings = await getPowerOfficeSettings();
  return settings?.writeEnabled ?? false;
}
