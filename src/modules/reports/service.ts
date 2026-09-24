// GE-10: salgs- og konverteringsrapporter. «Salg» er fakturagrunnlaget på
// bekreftede ordre (Order.quote.totalMinor) – CRM sin egen oppfatning av hva
// som er solgt, ikke PowerOffice sin fakturerte sum (som kan avvike ved
// kreditnotaer/delvis fakturering). Betalingsstatus vises separat (IN-10–12).
// Kansellerte ordre telles ikke som salg.
import { prisma } from '@/lib/db';

export interface ReportDateRange {
  from?: Date;
  to?: Date;
}

export interface SalesByCustomerRow {
  customerId: string;
  customerName: string;
  currency: string;
  orderCount: number;
  totalMinor: number;
}

export interface SalesByCustomerGroupRow {
  groupId: string | null;
  groupName: string;
  currency: string;
  orderCount: number;
  totalMinor: number;
}

export interface SalesByMaterialRow {
  materialId: string;
  materialName: string;
  currency: string;
  quantityMilli: number;
  unit: string;
  totalMinor: number;
}

export interface QuoteConversionSummary {
  totalSentQuotes: number;
  convertedQuotes: number;
  conversionRatePercent: number;
}

async function loadOrdersInRange(range: ReportDateRange) {
  return prisma.order.findMany({
    where: {
      status: { not: 'CANCELLED' },
      createdAt: {
        ...(range.from ? { gte: range.from } : {}),
        ...(range.to ? { lte: range.to } : {}),
      },
    },
    include: {
      quote: {
        include: {
          customer: { include: { groups: true } },
          lines: { include: { material: true } },
        },
      },
    },
  });
}

/** GE-10: salg per kunde. */
export async function salesByCustomer(range: ReportDateRange = {}): Promise<SalesByCustomerRow[]> {
  const orders = await loadOrdersInRange(range);
  const rows = new Map<string, SalesByCustomerRow>();

  for (const order of orders) {
    const customer = order.quote.customer;
    const key = `${customer.id}:${order.quote.currency}`;
    const existing = rows.get(key);
    if (existing) {
      existing.orderCount += 1;
      existing.totalMinor += order.quote.totalMinor;
    } else {
      rows.set(key, {
        customerId: customer.id,
        customerName: customer.name,
        currency: order.quote.currency,
        orderCount: 1,
        totalMinor: order.quote.totalMinor,
      });
    }
  }

  return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

/** GE-10: salg per kundegruppe. En kunde uten gruppe telles under «Uten gruppe». */
export async function salesByCustomerGroup(range: ReportDateRange = {}): Promise<SalesByCustomerGroupRow[]> {
  const orders = await loadOrdersInRange(range);
  const rows = new Map<string, SalesByCustomerGroupRow>();

  for (const order of orders) {
    const groups = order.quote.customer.groups;
    const targets = groups.length > 0 ? groups.map((g) => ({ id: g.id, name: g.name })) : [{ id: null, name: 'Uten gruppe' }];

    for (const target of targets) {
      const key = `${target.id ?? 'none'}:${order.quote.currency}`;
      const existing = rows.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalMinor += order.quote.totalMinor;
      } else {
        rows.set(key, {
          groupId: target.id,
          groupName: target.name,
          currency: order.quote.currency,
          orderCount: 1,
          totalMinor: order.quote.totalMinor,
        });
      }
    }
  }

  return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

/** GE-10: salg per materiale. Linjer uten materialkobling (fritekst) telles ikke. */
export async function salesByMaterial(range: ReportDateRange = {}): Promise<SalesByMaterialRow[]> {
  const orders = await loadOrdersInRange(range);
  const rows = new Map<string, SalesByMaterialRow>();

  for (const order of orders) {
    for (const line of order.quote.lines) {
      if (!line.materialId || !line.material) {
        continue;
      }
      const key = `${line.materialId}:${order.quote.currency}`;
      const existing = rows.get(key);
      if (existing) {
        existing.quantityMilli += line.quantityMilli;
        existing.totalMinor += line.lineTotalMinor;
      } else {
        rows.set(key, {
          materialId: line.materialId,
          materialName: line.material.name,
          currency: order.quote.currency,
          quantityMilli: line.quantityMilli,
          unit: line.unit,
          totalMinor: line.lineTotalMinor,
        });
      }
    }
  }

  return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

/**
 * GE-10: tilbudskonvertering. Regnes kun av tilbud som faktisk er sendt
 * (DRAFT er ikke et reelt forsøk), og en «konvertert» er et sendt tilbud som
 * har fått en ordre (uansett om ordren senere ble kansellert – selve
 * konverteringen skjedde).
 */
export async function quoteConversionSummary(range: ReportDateRange = {}): Promise<QuoteConversionSummary> {
  const sentQuotes = await prisma.quote.findMany({
    where: {
      status: { not: 'DRAFT' },
      sentAt: {
        ...(range.from ? { gte: range.from } : {}),
        ...(range.to ? { lte: range.to } : {}),
      },
    },
    select: { id: true, order: { select: { id: true } } },
  });

  const totalSentQuotes = sentQuotes.length;
  const convertedQuotes = sentQuotes.filter((quote) => quote.order !== null).length;
  const conversionRatePercent = totalSentQuotes > 0 ? Math.round((convertedQuotes / totalSentQuotes) * 1000) / 10 : 0;

  return { totalSentQuotes, convertedQuotes, conversionRatePercent };
}
