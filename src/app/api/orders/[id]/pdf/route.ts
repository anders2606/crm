import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { renderOrderConfirmationPdf } from '@/modules/orders/pdf';
import { resolveTemplate } from '@/modules/templates/service';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.ORDER_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return new NextResponse('Ikke innlogget', { status: 401 });
    }
    if (error instanceof PermissionDeniedError) {
      return new NextResponse('Ingen tilgang', { status: 403 });
    }
    throw error;
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { quote: { include: { customer: { include: { addresses: true, groups: true } }, lines: true } } },
  });
  if (!order) {
    return new NextResponse('Fant ikke ordren', { status: 404 });
  }

  const invoiceAddress =
    order.quote.customer.addresses.find((a) => a.type === 'INVOICE') ?? order.quote.customer.addresses[0];
  const customerAddress = invoiceAddress
    ? `${invoiceAddress.street}, ${invoiceAddress.postalCode} ${invoiceAddress.city}`
    : null;

  const template = await resolveTemplate({
    type: 'ORDER_CONFIRMATION',
    language: order.quote.language,
    customerGroupId: order.quote.customer.groups[0]?.id ?? null,
  });

  const buffer = await renderOrderConfirmationPdf({
    orderNumber: order.number,
    quoteNumber: order.quote.number,
    createdAt: order.createdAt,
    customerName: order.quote.customer.name,
    customerAddress,
    currency: order.quote.currency,
    lines: order.quote.lines.map((line) => ({ description: line.description, lineTotalMinor: line.lineTotalMinor })),
    totalMinor: order.quote.totalMinor,
    confirmationText: template?.content ?? null,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${order.number}.pdf"`,
    },
  });
}
