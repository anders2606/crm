// GE-11: en fremtidig nettbutikk sender inn kunder herfra ved checkout.
// KU-10: unngår duplikat ved eksakt treff på org.nr./e-post – samme
// eksisterende kunde gjenbrukes fremfor å opprette en ny.
import { NextResponse } from 'next/server';

import { logAudit } from '@/lib/audit/log';
import { API_SCOPES } from '@/lib/api-keys';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { requireApiScope } from '@/modules/api/auth';

interface CreateCustomerBody {
  name?: unknown;
  type?: unknown;
  email?: unknown;
  phone?: unknown;
  orgNr?: unknown;
}

export async function POST(request: Request) {
  const auth = await requireApiScope(request, API_SCOPES.CUSTOMERS_WRITE);
  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as CreateCustomerBody | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Feltet «name» er påkrevd' }, { status: 400 });
  }

  const type = body?.type === 'PRIVATE' ? 'PRIVATE' : 'COMPANY';
  const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim() : null;
  const orgNr = typeof body?.orgNr === 'string' && body.orgNr.trim() ? body.orgNr.trim() : null;
  const phone = typeof body?.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;

  if (orgNr || email) {
    const existing = await prisma.customer.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(orgNr ? [{ orgNr: { equals: orgNr, mode: 'insensitive' as const } }] : []),
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
    });
    if (existing) {
      return NextResponse.json({ data: { id: existing.id, created: false } });
    }
  }

  const customer = await prisma.customer.create({ data: { type, name, email, orgNr, phone } });

  await logAudit({
    userId: null,
    action: 'create',
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customer.id,
    after: { name: customer.name, source: 'api' },
  });

  return NextResponse.json({ data: { id: customer.id, created: true } }, { status: 201 });
}
