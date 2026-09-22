'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PowerOfficeEnvironment } from '@prisma/client';

import { logAudit } from '@/lib/audit/log';
import { prisma } from '@/lib/db';
import { enqueuePowerOfficeSync } from '@/lib/jobs';
import { encryptSecret } from '@/lib/secrets';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

const SETTINGS_ID = 'singleton';

// IN-23: miljøvalg og nøkler settes her, ikke i .env/kode. Første gang
// PRODUCTION velges tvinges skriving av – administrator må lagre på nytt
// for å slå den på, slik at en feiltrykk ikke kan sende ekte data ved et uhell.
export async function savePowerOfficeSettings(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.POWEROFFICE_MANAGE);

  const environment = formData.get('environment') as PowerOfficeEnvironment;
  const applicationKey = String(formData.get('applicationKey') ?? '').trim();
  const clientKey = String(formData.get('clientKey') ?? '').trim();
  const subscriptionKey = String(formData.get('subscriptionKey') ?? '').trim();
  const apiBaseUrlOverride = String(formData.get('apiBaseUrlOverride') ?? '').trim();
  const tokenUrlOverride = String(formData.get('tokenUrlOverride') ?? '').trim();
  const writeEnabledRequested = formData.get('writeEnabled') === 'on';

  if (environment !== 'DEMO' && environment !== 'PRODUCTION') {
    redirect('/admin/poweroffice?error=invalid_environment');
  }

  const existing = await prisma.powerOfficeSettings.findUnique({ where: { id: SETTINGS_ID } });

  const enteringProductionForFirstTime = environment === 'PRODUCTION' && existing?.environment !== 'PRODUCTION';
  const writeEnabled = enteringProductionForFirstTime ? false : writeEnabledRequested;

  const data = {
    environment,
    ...(applicationKey ? { encryptedApplicationKey: encryptSecret(applicationKey) } : {}),
    ...(clientKey ? { encryptedClientKey: encryptSecret(clientKey) } : {}),
    ...(subscriptionKey ? { encryptedSubscriptionKey: encryptSecret(subscriptionKey) } : {}),
    apiBaseUrlOverride: apiBaseUrlOverride || null,
    tokenUrlOverride: tokenUrlOverride || null,
    writeEnabled,
    updatedById: session.id,
  };

  await prisma.powerOfficeSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });

  await logAudit({
    userId: session.id,
    action: existing ? 'update' : 'create',
    entityType: 'PowerOfficeSettings',
    entityId: SETTINGS_ID,
    after: { environment, writeEnabled, keysUpdated: { applicationKey: !!applicationKey, clientKey: !!clientKey, subscriptionKey: !!subscriptionKey } },
  });

  if (enteringProductionForFirstTime) {
    redirect('/admin/poweroffice?notice=production_read_only');
  }

  revalidatePath('/admin/poweroffice');
}

// IN-01: administrator velger å hente inn "alle" fra PowerOffice.
export async function importAllFromPowerOfficeAction(): Promise<void> {
  await requirePermission(PERMISSIONS.POWEROFFICE_MANAGE);
  await enqueuePowerOfficeSync({ kind: 'import-all' });
  redirect('/admin/poweroffice?notice=import_queued');
}

// IN-01: administrator velger å hente inn "et utvalg" – én bestemt post på org.nr.
export async function lookupOrgNrAction(formData: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.POWEROFFICE_MANAGE);
  const entityType = formData.get('entityType') === 'Supplier' ? 'Supplier' : 'Customer';
  const orgNr = String(formData.get('orgNr') ?? '').trim();
  if (!orgNr) {
    redirect('/admin/poweroffice?error=missing_org_nr');
  }
  await enqueuePowerOfficeSync({ kind: 'lookup-org-nr', entityType, orgNr });
  redirect('/admin/poweroffice?notice=lookup_queued');
}
