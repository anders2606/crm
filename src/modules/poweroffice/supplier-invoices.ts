// BI-02/03: henting av inngående fakturaer (beløp/forfall/status) per
// leverandør fra PowerOffice. Kalles KUN fra workeren (arbeidsregel 12) –
// leverandørkortet leser den cachede tabellen (SupplierInvoiceStatus),
// aldri PowerOffice direkte i en sideforespørsel. PowerOffice forblir fasit
// for bilag – dette er et read-only speil, ikke et eget bilagsarkiv.
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { getPowerOfficeClient } from '@/integrations/poweroffice';

import { computeInvoicePaymentStatus } from './payment-status';
import { getPowerOfficeCredentials } from './settings';
import { recordSyncLog } from './sync-log';

export async function syncSupplierInvoiceStatuses(): Promise<number> {
  const credentials = await getPowerOfficeCredentials();
  if (!credentials) {
    return 0;
  }

  const client = getPowerOfficeClient(credentials);
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null, poweroffice_id: { not: null } },
  });

  let synced = 0;

  for (const supplier of suppliers) {
    if (!supplier.poweroffice_id) {
      continue;
    }
    try {
      const invoices = await client.listIncomingInvoicesForSupplier(supplier.poweroffice_id);
      for (const invoice of invoices) {
        const status = computeInvoicePaymentStatus(invoice.balanceMinor, invoice.totalAmountMinor);
        await prisma.supplierInvoiceStatus.upsert({
          where: { supplierId_powerOfficeId: { supplierId: supplier.id, powerOfficeId: invoice.powerOfficeId } },
          create: {
            supplierId: supplier.id,
            powerOfficeId: invoice.powerOfficeId,
            invoiceNo: invoice.invoiceNo,
            totalAmountMinor: invoice.totalAmountMinor,
            balanceMinor: invoice.balanceMinor,
            dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
            status,
          },
          update: {
            invoiceNo: invoice.invoiceNo,
            totalAmountMinor: invoice.totalAmountMinor,
            balanceMinor: invoice.balanceMinor,
            dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
            status,
          },
        });
      }
      synced += 1;
    } catch (error) {
      await recordSyncLog({
        direction: 'in',
        status: 'error',
        entityType: ENTITY_TYPES.SUPPLIER,
        entityId: supplier.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (synced > 0) {
    await recordSyncLog({
      direction: 'in',
      status: 'success',
      message: `Bilag/betalingsstatus oppdatert for ${synced} leverandør(er).`,
    });
  }

  return synced;
}
