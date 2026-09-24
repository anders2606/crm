import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { CustomFieldsSection } from '@/components/custom-fields-section';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, hasPermission, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { INVOICE_PAYMENT_STATUS_LABELS } from '@/modules/poweroffice/payment-status';
import { ORDER_STATUS_LABELS } from '@/modules/quotes/service';

import { setOrderStatus, transferOrder } from './actions';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(date);
}

const NEXT_STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  CONFIRMED: [
    { value: 'IN_PRODUCTION', label: 'Sett i produksjon' },
    { value: 'CANCELLED', label: 'Kanseller' },
  ],
  IN_PRODUCTION: [
    { value: 'DELIVERED', label: 'Merk som levert' },
    { value: 'CANCELLED', label: 'Kanseller' },
  ],
  DELIVERED: [],
  CANCELLED: [],
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  let session;
  try {
    session = await requirePermission(PERMISSIONS.ORDER_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?next=/orders/${params.id}`);
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

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { quote: { include: { customer: true, lines: true } } },
  });
  if (!order) {
    notFound();
  }

  const canWrite = hasPermission(session, PERMISSIONS.ORDER_WRITE);
  const nextOptions = NEXT_STATUS_OPTIONS[order.status] ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/orders" className="text-sm text-slate-600 underline">
          ← Ordre
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{order.number}</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{ORDER_STATUS_LABELS[order.status]}</span>
        </div>
        <p className="text-sm text-slate-600">
          <Link href={`/customers/${order.quote.customerId}`} className="underline">
            {order.quote.customer.name}
          </Link>
          {' · basert på tilbud '}
          <Link href={`/quotes/${order.quoteId}`} className="underline">
            {order.quote.number}
          </Link>
          {' · opprettet '}
          {formatDate(order.createdAt)}
        </p>
      </div>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {order.transferredToPowerOffice ? (
          `Overført til PowerOffice (${order.poweroffice_id}).`
        ) : (
          <div className="flex items-center justify-between gap-4">
            <span>Ikke overført til PowerOffice ennå (TO-09/IN-02).</span>
            {canWrite && (
              <form action={transferOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="rounded border border-amber-400 px-3 py-1.5 hover:bg-amber-100">
                  Overfør til PowerOffice
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {order.transferredToPowerOffice && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-2 font-medium">Betalingsstatus (IN-10, IN-12)</h2>
          {order.paymentStatus ? (
            <p className="text-sm text-slate-700">
              Faktura {order.powerOfficeInvoiceNo ?? '–'}:{' '}
              <span
                className={
                  order.paymentStatus === 'PAID'
                    ? 'font-medium text-emerald-700'
                    : order.paymentStatus === 'PARTIALLY_PAID'
                      ? 'font-medium text-amber-700'
                      : 'font-medium text-slate-700'
                }
              >
                {INVOICE_PAYMENT_STATUS_LABELS[order.paymentStatus]}
              </span>{' '}
              <span className="text-xs text-slate-500">
                (fra PowerOffice, {order.paymentSyncedAt ? formatDate(order.paymentSyncedAt) : '–'})
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Ikke fakturert i PowerOffice ennå – oppdateres automatisk minst hver time (IN-22).
            </p>
          )}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Linjer</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
          <tbody>
            {order.quote.lines.map((line) => (
              <tr key={line.id} className="border-b border-slate-100">
                <td className="py-2">{line.description}</td>
                <td className="py-2 text-right">{formatMoney(line.lineTotalMinor, order.quote.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="mt-2 flex justify-between text-sm font-medium">
          <span>Totalt</span>
          <span>{formatMoney(order.quote.totalMinor, order.quote.currency)}</span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Ordrebekreftelse</h2>
        <a href={`/api/orders/${order.id}/pdf`} target="_blank" rel="noreferrer" className="text-sm underline">
          Åpne/last ned PDF
        </a>
      </section>

      <CustomFieldsSection entityType={ENTITY_TYPES.ORDER} entityId={order.id} />

      {canWrite && nextOptions.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Status</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {nextOptions.map((option) => (
              <form key={option.value} action={setOrderStatus}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="status" value={option.value} />
                <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  {option.label}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
