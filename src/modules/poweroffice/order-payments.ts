// IN-10/11/12: betalingsstatus på ordre hentes fra PowerOffice sin utgående
// faktura (matchet på ExternalImportReference = ordrenummeret, satt av CRM
// ved overføring, src/modules/poweroffice/order-transfer.ts). Kalles KUN fra
// workeren (arbeidsregel 12) – ordre-/kundesidene leser cachede felt.
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { getPowerOfficeClient } from '@/integrations/poweroffice';

import { computeInvoicePaymentStatus } from './payment-status';
import { getPowerOfficeCredentials } from './settings';
import { recordSyncLog } from './sync-log';

export async function syncOrderPaymentStatuses(): Promise<number> {
  const credentials = await getPowerOfficeCredentials();
  if (!credentials) {
    return 0;
  }

  const client = getPowerOfficeClient(credentials);
  const orders = await prisma.order.findMany({
    where: { transferredToPowerOffice: true },
  });

  let synced = 0;

  for (const order of orders) {
    try {
      const invoice = await client.findOutgoingInvoiceByOrderReference(order.number);
      if (!invoice) {
        continue; // PowerOffice har ikke fakturert ordren ennå
      }

      const status = computeInvoicePaymentStatus(invoice.balanceMinor, invoice.totalAmountMinor);
      const receivedFirstPayment =
        (order.paymentStatus === null || order.paymentStatus === 'UNPAID') &&
        (status === 'PARTIALLY_PAID' || status === 'PAID');

      await prisma.order.update({
        where: { id: order.id },
        data: {
          powerOfficeInvoiceNo: invoice.invoiceNo,
          paymentStatus: status,
          paymentSyncedAt: new Date(),
        },
      });
      synced += 1;

      // IN-13 (BØR): varsler selger om mottatt forskudd/innbetaling på en
      // ordre som ennå ikke er satt i produksjon, slik at den kan startes.
      if (receivedFirstPayment && order.status === 'CONFIRMED' && order.createdById) {
        await prisma.task.create({
          data: {
            title: `Betaling mottatt på ordre ${order.number} – kan settes i produksjon`,
            assigneeId: order.createdById,
            entityType: ENTITY_TYPES.ORDER,
            entityId: order.id,
            createdById: null,
          },
        });
      }
    } catch (error) {
      await recordSyncLog({
        direction: 'in',
        status: 'error',
        entityType: ENTITY_TYPES.ORDER,
        entityId: order.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (synced > 0) {
    await recordSyncLog({
      direction: 'in',
      status: 'success',
      message: `Betalingsstatus oppdatert for ${synced} ordre(r).`,
    });
  }

  return synced;
}
