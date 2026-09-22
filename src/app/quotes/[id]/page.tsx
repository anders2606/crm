import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import {
  AuthenticationRequiredError,
  hasPermission,
  PermissionDeniedError,
  PERMISSIONS,
  requirePermission,
} from '@/lib/rbac/permissions';
import { getAccessibleEmailAccounts } from '@/modules/email/access';
import { MATERIAL_TYPE_LABELS } from '@/modules/materials/service';
import { OPEN_QUOTE_STATUSES, QUOTE_STATUS_LABELS } from '@/modules/quotes/service';

import {
  addQuoteLine,
  createQuoteRevision,
  removeQuoteLine,
  requestSendQuote,
  setQuoteStatus,
  updateQuoteMeta,
} from './actions';

function formatDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

function formatQuantity(quantityMilli: number): string {
  const value = quantityMilli / 1000;
  return value % 1 === 0 ? value.toFixed(0) : value.toString().replace('.', ',');
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_line_fields: 'Fyll ut beskrivelse, enhet, antall og pris.',
  cannot_send: 'Tilbudet må ha minst én linje og en gyldig e-postkonto valgt.',
  missing_customer_email: 'Kunden mangler e-postadresse – legg til én før sending.',
  invalid_status: 'Ugyldig status.',
  missing_lost_reason: 'Årsak må fylles ut når tilbudet avslås.',
  not_current: 'Kun gjeldende revisjon kan få en ny revisjon.',
};

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  let session;
  try {
    session = await requirePermission(PERMISSIONS.QUOTE_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?next=/quotes/${params.id}`);
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

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      lines: { orderBy: { sortOrder: 'asc' }, include: { material: true } },
    },
  });
  if (!quote) {
    notFound();
  }

  const canWrite = hasPermission(session, PERMISSIONS.QUOTE_WRITE);
  const isDraft = quote.status === 'DRAFT';

  const [otherRevisions, materials, textBlocks, emailAccounts, order] = await Promise.all([
    prisma.quote.findMany({
      where: { groupId: quote.groupId, id: { not: quote.id } },
      orderBy: { revision: 'asc' },
      select: { id: true, number: true, revision: true, status: true, isCurrent: true },
    }),
    prisma.material.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, take: 500 }),
    prisma.textBlock.findMany({ where: { isCurrent: true }, orderBy: { name: 'asc' } }),
    getAccessibleEmailAccounts(session.id),
    prisma.order.findUnique({ where: { quoteId: quote.id } }),
  ]);

  const error = typeof searchParams.error === 'string' ? searchParams.error : null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/quotes" className="text-sm text-slate-600 underline">
          ← Tilbud
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            {quote.number}{' '}
            {!quote.isCurrent && <span className="text-sm font-normal text-slate-500">(eldre revisjon)</span>}
          </h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{QUOTE_STATUS_LABELS[quote.status]}</span>
        </div>
        <p className="text-sm text-slate-600">
          <Link href={`/customers/${quote.customerId}`} className="underline">
            {quote.customer.name}
          </Link>
          {' · '}
          Opprettet {new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(quote.createdAt)}
        </p>
        {otherRevisions.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Revisjoner:{' '}
            {[{ id: quote.id, number: quote.number, isCurrent: quote.isCurrent }, ...otherRevisions]
              .sort((a, b) => a.number.localeCompare(b.number))
              .map((rev, index, all) => (
                <span key={rev.id}>
                  <Link href={`/quotes/${rev.id}`} className={rev.id === quote.id ? 'font-medium underline' : 'underline'}>
                    {rev.number}
                  </Link>
                  {index < all.length - 1 ? ', ' : ''}
                </span>
              ))}
          </p>
        )}
        {order && (
          <p className="mt-1 text-sm text-emerald-700">
            Konvertert til ordre{' '}
            <Link href={`/orders/${order.id}`} className="underline">
              {order.number}
            </Link>
          </p>
        )}
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_MESSAGES[error] ?? error}</p>}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Linjer</h2>
        {quote.lines.length === 0 ? (
          <p className="mb-4 text-sm text-slate-600">Ingen linjer lagt til ennå.</p>
        ) : (
          <table className="mb-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Beskrivelse</th>
                <th className="py-2">Antall</th>
                <th className="py-2 text-right">Pris</th>
                <th className="py-2 text-right">Rabatt</th>
                <th className="py-2 text-right">Sum</th>
                {isDraft && canWrite && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="py-2">
                    {line.description}
                    {line.material && (
                      <span className="ml-1 text-xs text-slate-500">
                        ({MATERIAL_TYPE_LABELS[line.material.type]})
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {formatQuantity(line.quantityMilli)} {line.unit}
                  </td>
                  <td className="py-2 text-right">{formatMoney(line.unitPriceMinor, quote.currency)}</td>
                  <td className="py-2 text-right">{line.discountPercent > 0 ? `${line.discountPercent} %` : '–'}</td>
                  <td className="py-2 text-right">{formatMoney(line.lineTotalMinor, quote.currency)}</td>
                  {isDraft && canWrite && (
                    <td className="py-2 text-right">
                      <form action={removeQuoteLine}>
                        <input type="hidden" name="lineId" value={line.id} />
                        <button type="submit" className="text-xs text-red-600 underline">
                          Fjern
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Sum</span>
            <span>{formatMoney(quote.subtotalMinor, quote.currency)}</span>
          </div>
          {quote.discountMinor > 0 && (
            <div className="flex justify-between">
              <span>Rabatt</span>
              <span>-{formatMoney(quote.discountMinor, quote.currency)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>MVA</span>
            <span>{formatMoney(quote.vatMinor, quote.currency)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Totalt</span>
            <span>{formatMoney(quote.totalMinor, quote.currency)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>DB (kun internt)</span>
            <span>{formatMoney(quote.dbMinor, quote.currency)}</span>
          </div>
        </div>

        {isDraft && canWrite && (
          <form action={addQuoteLine} className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-6">
            <input type="hidden" name="quoteId" value={quote.id} />
            <select name="materialId" defaultValue="" className="col-span-2 rounded border border-slate-300 px-2 py-1.5 sm:col-span-2">
              <option value="">Fritekst (uten materiale)</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
            <input name="description" placeholder="Beskrivelse" className="col-span-2 rounded border border-slate-300 px-2 py-1.5 sm:col-span-2" />
            <input name="unit" placeholder="Enhet (m², lm, stk)" className="rounded border border-slate-300 px-2 py-1.5" />
            <input name="quantity" placeholder="Antall" className="rounded border border-slate-300 px-2 py-1.5" />
            <input name="unitPrice" placeholder="Pris" className="rounded border border-slate-300 px-2 py-1.5" />
            <input name="discountPercent" type="number" min="0" max="100" placeholder="Rabatt %" className="rounded border border-slate-300 px-2 py-1.5" />
            <input name="vatRatePercent" type="number" min="0" max="100" defaultValue={25} placeholder="MVA %" className="rounded border border-slate-300 px-2 py-1.5" />
            <button type="submit" className="col-span-2 rounded bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800 sm:col-span-1">
              Legg til linje
            </button>
          </form>
        )}
      </section>

      {isDraft && canWrite && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Vilkår og gyldighet</h2>
          <form action={updateQuoteMeta} className="space-y-4">
            <input type="hidden" name="quoteId" value={quote.id} />
            <label className="block text-sm font-medium">
              Gyldig til
              <input
                type="date"
                name="validUntil"
                defaultValue={formatDateInput(quote.validUntil)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            {textBlocks.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium">Tekstblokker (TO-03)</legend>
                <div className="mt-1 space-y-1 text-sm">
                  {textBlocks.map((block) => (
                    <label key={block.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="textBlockIds"
                        value={block.id}
                        defaultChecked={quote.selectedTextBlockIds.includes(block.id)}
                      />
                      {block.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Lagre
            </button>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">PDF</h2>
        <a href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer" className="text-sm underline">
          Åpne/last ned PDF
        </a>
      </section>

      {isDraft && canWrite && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Send tilbud (TO-06)</h2>
          {emailAccounts.length === 0 ? (
            <p className="text-sm text-slate-600">Du har ikke tilgang til noen e-postkonto å sende fra.</p>
          ) : (
            <form action={requestSendQuote} className="flex items-end gap-3 text-sm">
              <input type="hidden" name="quoteId" value={quote.id} />
              <label className="block font-medium">
                Fra
                <select name="emailAccountId" className="mt-1 rounded border border-slate-300 px-3 py-2">
                  {emailAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.address}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
                Send tilbud til {quote.customer.email ?? '(mangler e-post)'}
              </button>
            </form>
          )}
        </section>
      )}

      {canWrite && OPEN_QUOTE_STATUSES.includes(quote.status) && quote.status !== 'DRAFT' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Status</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <form action={setQuoteStatus}>
              <input type="hidden" name="quoteId" value={quote.id} />
              <input type="hidden" name="status" value="ANSWERED" />
              <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                Merk som besvart
              </button>
            </form>
            <form action={setQuoteStatus}>
              <input type="hidden" name="quoteId" value={quote.id} />
              <input type="hidden" name="status" value="ACCEPTED" />
              <button type="submit" className="rounded border border-emerald-300 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50">
                Akseptert
              </button>
            </form>
            <form action={setQuoteStatus} className="flex items-center gap-2">
              <input type="hidden" name="quoteId" value={quote.id} />
              <input type="hidden" name="status" value="REJECTED" />
              <input name="lostReason" placeholder="Årsak ved avslag" className="rounded border border-slate-300 px-2 py-1.5" />
              <button type="submit" className="rounded border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50">
                Avslått
              </button>
            </form>
          </div>
        </section>
      )}

      {canWrite && !isDraft && quote.isCurrent && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-2 font-medium">Revisjon (TO-10)</h2>
          <p className="mb-4 text-sm text-slate-600">
            Lager en ny versjon av tilbudet med kopi av alle linjer, slik at du kan gjøre endringer uten å påvirke det
            som allerede er sendt.
          </p>
          <form action={createQuoteRevision}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Lag ny revisjon
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
