import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { OPEN_QUOTE_STATUSES, QUOTE_PROBABILITY_BY_STATUS, QUOTE_STATUS_LABELS } from '@/modules/quotes/service';

function formatDate(date: Date | null): string {
  return date ? new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(date) : '–';
}

// OP-07: oversikt over åpne tilbud med verdi, status, sannsynlighet og neste oppfølgingsdato.
export default async function QuotesPipelinePage() {
  try {
    await requirePermission(PERMISSIONS.QUOTE_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/quotes/pipeline');
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
    where: { isCurrent: true, status: { in: OPEN_QUOTE_STATUSES } },
    orderBy: [{ nextFollowUpAt: 'asc' }, { createdAt: 'desc' }],
    include: { customer: true },
  });

  const totalValueMinor = quotes.reduce((sum, quote) => sum + quote.totalMinor, 0);
  const weightedValueMinor = quotes.reduce(
    (sum, quote) => sum + Math.round((quote.totalMinor * (QUOTE_PROBABILITY_BY_STATUS[quote.status] ?? 0)) / 100),
    0,
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/quotes" className="text-sm text-slate-600 underline">
        ← Tilbud
      </Link>
      <h1 className="mt-1 mb-2 text-xl font-semibold">Pipeline</h1>
      <p className="mb-6 text-sm text-slate-600">
        {quotes.length} åpne tilbud · total verdi {formatMoney(totalValueMinor, 'NOK')} · sannsynlighetsvektet{' '}
        {formatMoney(weightedValueMinor, 'NOK')}
      </p>

      {quotes.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen åpne tilbud.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Nummer</th>
              <th className="py-2">Kunde</th>
              <th className="py-2 text-right">Verdi</th>
              <th className="py-2">Status</th>
              <th className="py-2 text-right">Sannsynlighet</th>
              <th className="py-2">Neste oppfølging</th>
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
                <td className="py-2 text-right">{formatMoney(quote.totalMinor, quote.currency)}</td>
                <td className="py-2">{QUOTE_STATUS_LABELS[quote.status]}</td>
                <td className="py-2 text-right">{QUOTE_PROBABILITY_BY_STATUS[quote.status] ?? 0} %</td>
                <td className="py-2">{formatDate(quote.nextFollowUpAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
