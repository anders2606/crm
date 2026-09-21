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

const TYPE_LABELS: Record<string, string> = {
  COMPANY: 'Bedrift',
  PRIVATE: 'Privat',
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  let session;
  try {
    session = await requirePermission(PERMISSIONS.CUSTOMER_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/customers');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å se kunder.
          </p>
        </main>
      );
    }
    throw error;
  }

  const query = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';

  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { orgNr: { contains: query, mode: 'insensitive' } },
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
        <h1 className="text-xl font-semibold">Kunder</h1>
        {hasPermission(session, PERMISSIONS.CUSTOMER_WRITE) && (
          <Link
            href="/customers/new"
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            Ny kunde
          </Link>
        )}
      </div>

      <form method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Søk på navn, e-post eller org.nr."
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      {customers.length === 0 ? (
        <p className="text-sm text-slate-600">
          Ingen kunder funnet{query ? ' for søket' : ''}. Systemet starter med tomme registre
          (KU-12) – opprett den første kunden med «Ny kunde».
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Navn</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Org.nr.</th>
                <th className="px-4 py-2 font-medium">E-post</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/customers/${customer.id}`} className="font-medium underline">
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{TYPE_LABELS[customer.type] ?? customer.type}</td>
                  <td className="px-4 py-2">{customer.orgNr ?? '—'}</td>
                  <td className="px-4 py-2">{customer.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
