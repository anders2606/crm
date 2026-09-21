import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { createCustomerGroup } from './actions';

export default async function CustomerGroupsPage() {
  try {
    await requirePermission(PERMISSIONS.CUSTOMER_WRITE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/customers/groups');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å administrere kundegrupper.
          </p>
        </main>
      );
    }
    throw error;
  }

  const groups = await prisma.customerGroup.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { customers: true } } },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <Link href="/customers" className="text-sm text-slate-600 underline">
          ← Kunder
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Kundegrupper</h1>
        <p className="text-sm text-slate-600">
          F.eks. privat, entreprenør, arkitekt, interiørarkitekt, forhandler, kjøkkenprodusent (KU-04).
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Ny gruppe</h2>
        <form action={createCustomerGroup} className="space-y-4">
          <label className="block text-sm font-medium">
            Navn
            <input name="name" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Beskrivelse
            <input name="description" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Opprett gruppe
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Eksisterende grupper</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen kundegrupper opprettet ennå.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <span className="font-medium">{group.name}</span>
                {group.description ? ` – ${group.description}` : ''} –{' '}
                {group._count.customers} kunde(r)
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
