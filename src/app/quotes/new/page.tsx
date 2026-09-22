import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { createQuote } from './actions';

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.QUOTE_WRITE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/quotes/new');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
        </main>
      );
    }
    throw error;
  }

  const preselectedCustomerId = typeof searchParams.customerId === 'string' ? searchParams.customerId : '';
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    take: 500,
  });
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href="/quotes" className="text-sm text-slate-600 underline">
        ← Tilbud
      </Link>
      <h1 className="mt-1 mb-6 text-xl font-semibold">Nytt tilbud</h1>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">Velg en kunde.</p>}

      <form action={createQuote} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <label className="block text-sm font-medium">
          Kunde
          <select
            name="customerId"
            required
            defaultValue={preselectedCustomerId}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="" disabled>
              Velg kunde
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          Språk
          <select name="language" defaultValue="nb" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="nb">Norsk</option>
            <option value="en">Engelsk</option>
          </select>
        </label>

        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          Opprett tilbud
        </button>
      </form>
    </main>
  );
}
