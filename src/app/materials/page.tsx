import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { MaterialAvailability, MaterialType, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import {
  AuthenticationRequiredError,
  hasPermission,
  PermissionDeniedError,
  PERMISSIONS,
  requirePermission,
} from '@/lib/rbac/permissions';
import { MATERIAL_AVAILABILITY_LABELS, MATERIAL_TYPE_LABELS } from '@/modules/materials/service';

function paramStr(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  let session;
  try {
    session = await requirePermission(PERMISSIONS.MATERIAL_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/materials');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å se materialbiblioteket.
          </p>
        </main>
      );
    }
    throw error;
  }

  const query = paramStr(searchParams.q).trim();
  const type = paramStr(searchParams.type);
  const color = paramStr(searchParams.color).trim();
  const origin = paramStr(searchParams.origin).trim();
  const availability = paramStr(searchParams.availability);

  const where: Prisma.MaterialWhereInput = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { tradeName: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(type ? { type: type as MaterialType } : {}),
    ...(color ? { color: { contains: color, mode: 'insensitive' } } : {}),
    ...(origin ? { origin: { contains: origin, mode: 'insensitive' } } : {}),
    ...(availability ? { availability: availability as MaterialAvailability } : {}),
  };

  const materials = await prisma.material.findMany({ where, orderBy: { name: 'asc' }, take: 100 });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Materialbibliotek</h1>
        {hasPermission(session, PERMISSIONS.MATERIAL_WRITE) && (
          <Link href="/materials/new" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Nytt materiale
          </Link>
        )}
      </div>

      <form method="get" className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Søk på navn/handelsnavn"
          className="col-span-2 rounded border border-slate-300 px-3 py-2 sm:col-span-1"
        />
        <select name="type" defaultValue={type} className="rounded border border-slate-300 px-3 py-2">
          <option value="">Alle typer</option>
          {Object.entries(MATERIAL_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input name="color" defaultValue={color} placeholder="Farge" className="rounded border border-slate-300 px-3 py-2" />
        <input name="origin" defaultValue={origin} placeholder="Opprinnelse" className="rounded border border-slate-300 px-3 py-2" />
        <select name="availability" defaultValue={availability} className="rounded border border-slate-300 px-3 py-2">
          <option value="">All tilgjengelighet</option>
          {Object.entries(MATERIAL_AVAILABILITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-50">
          Søk
        </button>
      </form>

      {materials.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen materialer funnet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {materials.map((material) => (
            <Link
              key={material.id}
              href={`/materials/${material.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm hover:border-slate-400"
            >
              <p className="font-medium">{material.name}</p>
              <p className="text-slate-600">{MATERIAL_TYPE_LABELS[material.type]}</p>
              {material.color && <p className="text-slate-500">{material.color}</p>}
              <p className="mt-1 text-xs text-slate-500">
                {MATERIAL_AVAILABILITY_LABELS[material.availability]}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
