import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { QUOTE_STATUS_LABELS } from '@/modules/quotes/service';

function formatDate(date: Date | null): string {
  return date ? new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(date) : '–';
}

export default async function QuotesPage() {
  try {
    await requirePermission(PERMISSIONS.QUOTE_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/quotes');
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

  const quotes = await prisma.quote.findMany({
    where: { isCurrent: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { customer: true },
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/" className="text-sm text-slate-600 underline">
        ← Dashbord
      </Link>
      <div className="mb-6 mt-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tilbud</h1>
        <Link href="/quotes/new" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          Nytt tilbud
        </Link>
      </div>

      {quotes.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen tilbud opprettet ennå.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Nummer</th>
              <th className="py-2">Kunde</th>
              <th className="py-2">Status</th>
              <th className="py-2 text-right">Totalt</th>
              <th className="py-2">Gyldig til</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2">
                  <Link href={`/quotes/${quote.id}`} className="underline">
                    {quote.number}
                  </Link>
                </td>
                <td className="py-2">{quote.customer.name}</td>
                <td className="py-2">{QUOTE_STATUS_LABELS[quote.status]}</td>
                <td className="py-2 text-right">{formatMoney(quote.totalMinor, quote.currency)}</td>
                <td className="py-2">{formatDate(quote.validUntil)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
