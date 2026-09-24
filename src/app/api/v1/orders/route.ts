// GE-11: en fremtidig nettbutikk sender inn en fullført bestilling herfra.
// En bestilling fra en nettbutikk er allerede akseptert av kunden (betalt i
// checkout) – det finnes ingen tilbudsfase å gå via, så API-et oppretter
// tilbudet (status ACCEPTED) og ordren (status CONFIRMED) i samme
// operasjon i stedet for å kreve et eget "godkjenn tilbud"-steg internt
// (bevisst tolkning, ikke eksplisitt dekket av kravspesifikasjonen).
import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { logAudit } from '@/lib/audit/log';
import { API_SCOPES } from '@/lib/api-keys';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { requireApiScope } from '@/modules/api/auth';
import { formatQuoteNumber, nextOrderNumber, nextQuoteBaseNumber } from '@/modules/quotes/numbering';
import { calculateLineAmounts, calculateQuoteTotals } from '@/modules/quotes/pricing';

interface CreateOrderLineBody {
  materialId?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPriceMinor?: unknown;
}

interface CreateOrderBody {
  customerId?: unknown;
  lines?: unknown;
}

export async function POST(request: Request) {
  const auth = await requireApiScope(request, API_SCOPES.ORDERS_WRITE);
  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as CreateOrderBody | null;
  const customerId = typeof body?.customerId === 'string' ? body.customerId : '';
  const rawLines = Array.isArray(body?.lines) ? (body.lines as CreateOrderLineBody[]) : [];
  if (!customerId || rawLines.length === 0) {
    return NextResponse.json({ error: 'Feltene «customerId» og minst én linje i «lines» er påkrevd' }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
  if (!customer) {
    return NextResponse.json({ error: 'Fant ikke kunden' }, { status: 404 });
  }

  const lineInputs: {
    materialId: string | null;
    description: string;
    quantityMilli: number;
    unit: string;
    unitPriceMinor: number;
  }[] = [];

  for (const raw of rawLines) {
    const quantityMilli = Math.round(Number(raw.quantity) * 1000);
    const unitPriceMinor = Math.round(Number(raw.unitPriceMinor));
    if (!Number.isFinite(quantityMilli) || quantityMilli <= 0 || !Number.isFinite(unitPriceMinor) || unitPriceMinor < 0) {
      return NextResponse.json({ error: 'Hver linje trenger et positivt «quantity» og et gyldig «unitPriceMinor»' }, { status: 400 });
    }

    let material = null;
    if (typeof raw.materialId === 'string' && raw.materialId) {
      material = await prisma.material.findUnique({ where: { id: raw.materialId } });
      if (!material) {
        return NextResponse.json({ error: `Fant ikke materiale ${raw.materialId}` }, { status: 404 });
      }
    }

    const description = typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : material?.name;
    if (!description) {
      return NextResponse.json({ error: 'Hver linje trenger «description» eller en gyldig «materialId»' }, { status: 400 });
    }

    lineInputs.push({
      materialId: material?.id ?? null,
      description,
      quantityMilli,
      unit: typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : 'stk',
      unitPriceMinor,
    });
  }

  const amounts = lineInputs.map((line) =>
    calculateLineAmounts({ ...line, discountPercent: 0, vatRatePercent: 25 }),
  );
  const totals = calculateQuoteTotals(amounts);

  const baseNumber = await nextQuoteBaseNumber();
  const quoteId = randomUUID();
  const now = new Date();
  const quote = await prisma.quote.create({
    data: {
      id: quoteId,
      groupId: quoteId,
      baseNumber,
      number: formatQuoteNumber(baseNumber, 1),
      status: 'ACCEPTED',
      customerId: customer.id,
      sentAt: now,
      respondedAt: now,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      vatMinor: totals.vatMinor,
      totalMinor: totals.totalMinor,
      lines: {
        create: lineInputs.map((line, index) => ({
          materialId: line.materialId,
          description: line.description,
          quantityMilli: line.quantityMilli,
          unit: line.unit,
          unitPriceMinor: line.unitPriceMinor,
          vatRatePercent: 25,
          lineTotalMinor: amounts[index]!.lineTotalMinor,
        })),
      },
    },
  });

  const orderNumber = await nextOrderNumber();
  const order = await prisma.order.create({
    data: { number: orderNumber, quoteId: quote.id, status: 'CONFIRMED' },
  });

  await logAudit({
    userId: null,
    action: 'create',
    entityType: ENTITY_TYPES.ORDER,
    entityId: order.id,
    after: { number: order.number, totalMinor: totals.totalMinor, source: 'api' },
  });

  return NextResponse.json(
    {
      data: {
        orderId: order.id,
        orderNumber: order.number,
        quoteId: quote.id,
        quoteNumber: quote.number,
        totalMinor: totals.totalMinor,
        currency: quote.currency,
      },
    },
    { status: 201 },
  );
}
