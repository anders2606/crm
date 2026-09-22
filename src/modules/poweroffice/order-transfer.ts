// IN-02: overføring av ordre/fakturagrunnlag fra CRM til PowerOffice for
// fakturering. Kalles KUN fra workeren (arbeidsregel 12).
import { prisma } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { logAudit } from '@/lib/audit/log';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { getPowerOfficeClient } from '@/integrations/poweroffice';

import { matchOrCreateCustomer } from './sync';
import { getPowerOfficeCredentials, isPowerOfficeWriteEnabled } from './settings';
import { recordSyncLog } from './sync-log';

export async function transferOrderToPowerOffice(orderId: string, userId: string | null): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { quote: { include: { customer: true, lines: true } } },
  });
  if (!order || order.transferredToPowerOffice) {
    return;
  }

  const credentials = await getPowerOfficeCredentials();
  if (!credentials) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: ENTITY_TYPES.ORDER,
      entityId: orderId,
      message: 'PowerOffice er ikke satt opp – kan ikke overføre ordre.',
    });
    return;
  }

  if (!(await isPowerOfficeWriteEnabled())) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: ENTITY_TYPES.ORDER,
      entityId: orderId,
      message: 'Skriving til PowerOffice er ikke aktivert – ordre ble ikke overført.',
    });
    return;
  }

  let customer = order.quote.customer;
  if (!customer.poweroffice_id) {
    await matchOrCreateCustomer(customer.id);
    customer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  }
  if (!customer.poweroffice_id) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: ENTITY_TYPES.ORDER,
      entityId: orderId,
      message: `Kunde ${customer.name} er ikke koblet til PowerOffice – kan ikke overføre ordre ${order.number}.`,
    });
    return;
  }

  try {
    const client = getPowerOfficeClient(credentials);
    const powerOfficeId = await client.createSalesOrder({
      customerPowerOfficeId: customer.poweroffice_id,
      orderNumber: order.number,
      currency: order.quote.currency,
      lines: order.quote.lines.map((line) => ({
        description: line.description,
        quantityMilli: line.quantityMilli,
        unitPriceMinor: line.unitPriceMinor,
      })),
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { poweroffice_id: powerOfficeId, transferredToPowerOffice: true },
    });

    await recordActivity({
      type: 'STATUS',
      text: `Ordre ${order.number} overført til PowerOffice (${powerOfficeId})`,
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: customer.id,
      createdById: userId,
    });

    await logAudit({
      userId,
      action: 'update',
      entityType: ENTITY_TYPES.ORDER,
      entityId: orderId,
      after: { transferredToPowerOffice: true, poweroffice_id: powerOfficeId },
    });

    await recordSyncLog({
      direction: 'out',
      status: 'success',
      entityType: ENTITY_TYPES.ORDER,
      entityId: orderId,
      message: `Ordre ${order.number} overført som PowerOffice-salgsordre ${powerOfficeId}.`,
    });
  } catch (error) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: ENTITY_TYPES.ORDER,
      entityId: orderId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
