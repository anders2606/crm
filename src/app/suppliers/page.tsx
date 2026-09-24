import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import {
  AuthenticationRequiredError,
  hasPermission,
  PermissionDeniedError,
  PERMISSIONS,
  requirePermission,
} from '@/lib/rbac/permissions';

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  let session;
  try {
    session = await requirePermission(PERMISSIONS.SUPPLIER_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/suppliers');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å se leverandører.
          </p>
        </main>
      );
    }
    throw error;
  }

  const query = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';

  const suppliers = await prisma.supplier.findMany({
    where: {
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { country: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leverandører</h1>
        {hasPermission(session, PERMISSIONS.SUPPLIER_WRITE) && (
          <Link
            href="/suppliers/new"
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            Ny leverandør
          </Link>
        )}
      </div>

      <form method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Søk på navn, e-post eller land"
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      {suppliers.length === 0 ? (
        <p className="text-sm text-slate-600">
          Ingen leverandører funnet{query ? ' for søket' : ''}. Systemet starter med tomme
          registre – opprett den første leverandøren med «Ny leverandør».
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Navn</th>
                <th className="px-4 py-2 font-medium">Land</th>
                <th className="px-4 py-2 font-medium">Valuta</th>
                <th className="px-4 py-2 font-medium">E-post</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/suppliers/${supplier.id}`} className="font-medium underline">
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{supplier.country}</td>
                  <td className="px-4 py-2">{supplier.currency}</td>
                  <td className="px-4 py-2">{supplier.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </main>
  );
}
