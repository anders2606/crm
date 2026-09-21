// GE-05: felles søk på tvers av kunder, leverandører, dokumenter, e-post,
// tilbud, ordre og bilag. Dokumenter/e-post/tilbud/ordre/bilag finnes ikke
// før M2/M3/M5/M7 – søket utvides med flere kilder etter hvert som de bygges.
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission, PERMISSIONS } from '@/lib/rbac/permissions';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSession();
  if (!session) {
    redirect('/login?next=/search');
  }

  const query = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';

  const [customers, suppliers] = await Promise.all([
    query && hasPermission(session, PERMISSIONS.CUSTOMER_READ)
      ? prisma.customer.findMany({
          where: {
            deletedAt: null,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { orgNr: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: 20,
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    query && hasPermission(session, PERMISSIONS.SUPPLIER_READ)
      ? prisma.supplier.findMany({
          where: {
            deletedAt: null,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { country: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: 20,
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-slate-600 underline">
        ← Dashbord
      </Link>
      <h1 className="mt-1 mb-6 text-xl font-semibold">Søk</h1>

      <form method="get" className="mb-8">
        <input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Søk på kunder og leverandører …"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      {!query ? (
        <p className="text-sm text-slate-600">Skriv et søk over.</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 font-medium">Kunder ({customers.length})</h2>
            {customers.length === 0 ? (
              <p className="text-sm text-slate-600">Ingen treff.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {customers.map((customer) => (
                  <li key={customer.id}>
                    <Link href={`/customers/${customer.id}`} className="underline">
                      {customer.name}
                    </Link>
                    {customer.orgNr ? ` – org.nr. ${customer.orgNr}` : ''}
                    {customer.email ? ` – ${customer.email}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-medium">Leverandører ({suppliers.length})</h2>
            {suppliers.length === 0 ? (
              <p className="text-sm text-slate-600">Ingen treff.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {suppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <Link href={`/suppliers/${supplier.id}`} className="underline">
                      {supplier.name}
                    </Link>
                    {` – ${supplier.country}`}
                    {supplier.email ? ` – ${supplier.email}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-slate-500">
            Dokumenter, e-post, tilbud, ordre og bilag inkluderes i søket etter hvert som disse
            modulene bygges (M2, M3, M5, M7).
          </p>
        </div>
      )}
    </main>
  );
}
