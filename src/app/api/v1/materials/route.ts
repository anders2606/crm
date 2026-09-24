// GE-11: åpent REST-API for en fremtidig nettbutikk (kap. 19: "Ingen
// plattform er valgt … API-et designes slik at en nettbutikk kan hente
// materialer, priser og lager"). Kun salgspris eksponeres her – aldri
// innkjøpspris (PriceEntryType.PURCHASE), som er intern kalkyle/DB-grunnlag.
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { API_SCOPES } from '@/lib/api-keys';
import { requireApiScope } from '@/modules/api/auth';

export async function GET(request: Request) {
  const auth = await requireApiScope(request, API_SCOPES.MATERIALS_READ);
  if (auth.error) {
    return auth.error;
  }

  const materials = await prisma.material.findMany({
    where: { deletedAt: null },
    include: {
      priceEntries: { where: { type: 'SALE' }, orderBy: { priceDate: 'desc' }, take: 1 },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    data: materials.map((material) => ({
      id: material.id,
      name: material.name,
      tradeName: material.tradeName,
      type: material.type,
      origin: material.origin,
      color: material.color,
      finish: material.finish,
      thicknessesMm: material.thicknessesMm,
      slabSizes: material.slabSizes,
      availability: material.availability,
      latestSalePrice: material.priceEntries[0]
        ? {
            amountMinor: material.priceEntries[0].amountNokMinor,
            currency: 'NOK',
            unit: material.priceEntries[0].unit,
            priceDate: material.priceEntries[0].priceDate,
          }
        : null,
    })),
  });
}
