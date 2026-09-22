// TO-06: PDF-forhåndsvisning/nedlasting av et tilbud. Rene, interne data –
// ingen eksternt systemkall her (kun renderQuotePdf, som er lokal rendering).
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { renderQuotePdf } from '@/modules/quotes/pdf';
import { buildTermsSnapshot, resolveTemplate } from '@/modules/templates/service';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.QUOTE_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return new NextResponse('Ikke innlogget', { status: 401 });
    }
    if (error instanceof PermissionDeniedError) {
      return new NextResponse('Ingen tilgang', { status: 403 });
    }
    throw error;
  }

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      customer: { include: { addresses: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!quote) {
    return new NextResponse('Fant ikke tilbudet', { status: 404 });
  }

  const invoiceAddress = quote.customer.addresses.find((a) => a.type === 'INVOICE') ?? quote.customer.addresses[0];
  const customerAddress = invoiceAddress
    ? `${invoiceAddress.street}, ${invoiceAddress.postalCode} ${invoiceAddress.city}`
    : null;

  // Tilbud som ikke er sendt ennå har ikke fått vilkårene sine frosset (SD-04)
  // – vis en live forhåndsvisning av malen som ville blitt brukt ved sending.
  let termsSnapshot = quote.termsSnapshot;
  if (!termsSnapshot) {
    const customerGroups = await prisma.customerGroup.findMany({
      where: { customers: { some: { id: quote.customerId } } },
      select: { id: true },
    });
    const template = await resolveTemplate({
      type: 'QUOTE',
      language: quote.language,
      customerGroupId: customerGroups[0]?.id ?? null,
    });
    const textBlocks = quote.selectedTextBlockIds.length
      ? await prisma.textBlock.findMany({ where: { id: { in: quote.selectedTextBlockIds }, isCurrent: true } })
      : [];
    termsSnapshot = buildTermsSnapshot(template?.content ?? '', textBlocks);
  }

  const buffer = await renderQuotePdf({
    number: quote.number,
    status: quote.status,
    currency: quote.currency,
    validUntil: quote.validUntil,
    createdAt: quote.createdAt,
    customerName: quote.customer.name,
    customerAddress,
    lines: quote.lines.map((line) => ({
      description: line.description,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      unitPriceMinor: line.unitPriceMinor,
      discountPercent: line.discountPercent,
      lineTotalMinor: line.lineTotalMinor,
    })),
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    vatMinor: quote.vatMinor,
    totalMinor: quote.totalMinor,
    termsSnapshot,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${quote.number}.pdf"`,
    },
  });
}
