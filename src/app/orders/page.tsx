import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { ORDER_STATUS_LABELS } from '@/modules/quotes/service';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(date);
}

export default async function OrdersPage() {
  try {
    await requirePermission(PERMISSIONS.ORDER_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/orders');
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

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { quote: { include: { customer: true } } },
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/" className="text-sm text-slate-600 underline">
        ← Dashbord
      </Link>
      <h1 className="mt-1 mb-6 text-xl font-semibold">Ordre</h1>

      {orders.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen ordre registrert ennå.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Nummer</th>
              <th className="py-2">Kunde</th>
              <th className="py-2">Tilbud</th>
              <th className="py-2">Status</th>
              <th className="py-2">PowerOffice</th>
              <th className="py-2">Opprettet</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2">
                  <Link href={`/orders/${order.id}`} className="underline">
                    {order.number}
                  </Link>
                </td>
                <td className="py-2">{order.quote.customer.name}</td>
                <td className="py-2">
                  <Link href={`/quotes/${order.quoteId}`} className="underline">
                    {order.quote.number}
                  </Link>
                </td>
                <td className="py-2">{ORDER_STATUS_LABELS[order.status]}</td>
                <td className="py-2 text-xs text-slate-500">
                  {order.transferredToPowerOffice ? 'Overført' : 'Ikke overført ennå'}
                </td>
                <td className="py-2">{formatDate(order.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
