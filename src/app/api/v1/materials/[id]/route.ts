// GE-11: detaljer for ett materiale, inkl. nylig salgsprishistorikk. Aldri
// innkjøpspris (se route.ts i overordnet mappe).
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { API_SCOPES } from '@/lib/api-keys';
import { requireApiScope } from '@/modules/api/auth';

const SALE_PRICE_HISTORY_LIMIT = 12;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiScope(request, API_SCOPES.MATERIALS_READ);
  if (auth.error) {
    return auth.error;
  }

  const material = await prisma.material.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      priceEntries: { where: { type: 'SALE' }, orderBy: { priceDate: 'desc' }, take: SALE_PRICE_HISTORY_LIMIT },
    },
  });
  if (!material) {
    return NextResponse.json({ error: 'Fant ikke materialet' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: material.id,
      name: material.name,
      tradeName: material.tradeName,
      type: material.type,
      origin: material.origin,
      color: material.color,
      finish: material.finish,
      thicknessesMm: material.thicknessesMm,
      slabSizes: material.slabSizes,
      maintenanceNotes: material.maintenanceNotes,
      availability: material.availability,
      salePriceHistory: material.priceEntries.map((entry) => ({
        amountMinor: entry.amountNokMinor,
        currency: 'NOK',
        unit: entry.unit,
        priceDate: entry.priceDate,
      })),
    },
  });
}
