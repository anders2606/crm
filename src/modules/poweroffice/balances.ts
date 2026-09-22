// IN-03/KU-03: henting av utestående saldo og forfalte poster per kunde.
// Kalles KUN fra workeren (arbeidsregel 12) – kundekortet leser den cachede
// verdien workeren skriver her, aldri PowerOffice direkte i en sideforespørsel.
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { getPowerOfficeClient } from '@/integrations/poweroffice';

import { getPowerOfficeCredentials } from './settings';
import { recordSyncLog } from './sync-log';

export async function syncAllCustomerBalances(): Promise<number> {
  const credentials = await getPowerOfficeCredentials();
  if (!credentials) {
    return 0;
  }

  const client = getPowerOfficeClient(credentials);
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, poweroffice_id: { not: null } },
  });

  let synced = 0;

  for (const customer of customers) {
    if (!customer.poweroffice_id) {
      continue;
    }
    try {
      const balance = await client.getCustomerBalance(customer.poweroffice_id);
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          outstandingBalanceMinor: balance.outstandingBalanceMinor,
          overdueAmountMinor: balance.overdueAmountMinor,
          balanceSyncedAt: new Date(),
        },
      });
      synced += 1;
    } catch (error) {
      await recordSyncLog({
        direction: 'in',
        status: 'error',
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: customer.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (synced > 0) {
    await recordSyncLog({
      direction: 'in',
      status: 'success',
      message: `Reskontro oppdatert for ${synced} kunde(r).`,
    });
  }

  return synced;
}
