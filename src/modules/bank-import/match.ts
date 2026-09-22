// LE-08/IN-10/IN-11: kobler en banktransaksjon til riktig kunde/leverandør
// og faktura – kun en heuristikk (beløp, deretter fakturanr./ordrenr. i
// meldingsteksten), IKKE en ekte KID-oppslag mot PoweOffice: PowerOffice sine
// faktura-DTO-er (OutgoingInvoiceDto/IncomingInvoiceListItemDto, se
// docs/poweroffice-apiv2-demo.json) har ingen eget KID-felt å slå opp mot,
// så en påstått KID-matching mot PoweOffice ville vært gjetting. Er
// PowerOffice selv à jour på betalingen, gjør neste synk (IN-10/11/12) jobben
// riktig uansett – denne matchingen er kun en rask, lokal indikasjon i
// påvente av det.
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';

import type { ParsedBankTransaction } from './types';

export interface BankTransactionMatch {
  entityType: string;
  entityId: string;
  invoiceNo: string | null;
}

async function matchSupplierPayment(tx: ParsedBankTransaction): Promise<BankTransactionMatch | null> {
  const absoluteAmount = Math.abs(tx.amountMinor);
  const openInvoices = await prisma.supplierInvoiceStatus.findMany({
    where: { status: { not: 'PAID' } },
  });

  const byAmount = openInvoices.filter((invoice) => invoice.balanceMinor === absoluteAmount);
  if (byAmount.length === 1) {
    return { entityType: ENTITY_TYPES.SUPPLIER, entityId: byAmount[0]!.supplierId, invoiceNo: byAmount[0]!.invoiceNo };
  }

  if (tx.reference) {
    const byReference = openInvoices.filter(
      (invoice) => invoice.invoiceNo && tx.reference!.includes(invoice.invoiceNo),
    );
    if (byReference.length === 1) {
      return {
        entityType: ENTITY_TYPES.SUPPLIER,
        entityId: byReference[0]!.supplierId,
        invoiceNo: byReference[0]!.invoiceNo,
      };
    }
  }

  return null;
}

async function matchCustomerReceipt(tx: ParsedBankTransaction): Promise<BankTransactionMatch | null> {
  const absoluteAmount = Math.abs(tx.amountMinor);
  const openOrders = await prisma.order.findMany({
    // SQL NULL-semantikk: "not: 'PAID'" alene ekskluderer rader der
    // paymentStatus er NULL (ikke synket ennå) – de skal også regnes som åpne.
    where: { transferredToPowerOffice: true, OR: [{ paymentStatus: null }, { paymentStatus: { not: 'PAID' } }] },
    include: { quote: true },
  });

  const byAmount = openOrders.filter((order) => order.quote.totalMinor === absoluteAmount);
  if (byAmount.length === 1) {
    return {
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: byAmount[0]!.quote.customerId,
      invoiceNo: byAmount[0]!.powerOfficeInvoiceNo,
    };
  }

  if (tx.reference) {
    const byReference = openOrders.filter(
      (order) => tx.reference!.includes(order.number) || tx.reference!.includes(order.quote.number),
    );
    if (byReference.length === 1) {
      return {
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: byReference[0]!.quote.customerId,
        invoiceNo: byReference[0]!.powerOfficeInvoiceNo,
      };
    }
  }

  return null;
}

/** Positivt beløp = innbetaling fra kunde (IN-10), negativt = utbetaling til leverandør (IN-11). */
export async function matchBankTransaction(tx: ParsedBankTransaction): Promise<BankTransactionMatch | null> {
  if (tx.amountMinor < 0) {
    return matchSupplierPayment(tx);
  }
  return matchCustomerReceipt(tx);
}
