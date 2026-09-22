import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { hasPermission, PERMISSIONS } from '@/lib/rbac/permissions';
import { getAccessibleEmailAccounts } from '@/modules/email/access';

import { assignToCustomer, assignToSupplier } from './actions';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default async function UnassignedEmailPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login?next=/email/unassigned');
  }

  const accessibleAccounts = await getAccessibleEmailAccounts(session.id);
  const accountIds = accessibleAccounts.map((account) => account.id);

  const [messages, customers, suppliers] = await Promise.all([
    accountIds.length > 0
      ? prisma.emailMessage.findMany({
          where: { emailAccountId: { in: accountIds }, entityType: null },
          orderBy: { occurredAt: 'desc' },
          take: 100,
          include: { emailAccount: { select: { address: true } } },
        })
      : Promise.resolve([]),
    hasPermission(session, PERMISSIONS.CUSTOMER_WRITE)
      ? prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
      : Promise.resolve([]),
    hasPermission(session, PERMISSIONS.SUPPLIER_WRITE)
      ? prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Tilordningskø</h1>
        <p className="text-sm text-slate-600">
          E-post som ikke automatisk kunne kobles til en kunde eller leverandør (EP-05). Viser kun
          postbokser du har tilgang til.
        </p>
      </div>

      {accessibleAccounts.length === 0 ? (
        <p className="text-sm text-slate-600">
          Du har ikke tilgang til noen e-postkontoer ennå. Be en administrator gi deg tilgang under{' '}
          <Link href="/email/accounts" className="underline">
            E-postkontoer
          </Link>
          .
        </p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen e-post venter på tilordning.</p>
      ) : (
        <ul className="space-y-4">
          {messages.map((message) => (
            <li key={message.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <p className="font-medium">{message.subject || '(uten emne)'}</p>
              <p className="text-slate-600">
                Fra: {message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress} –{' '}
                {formatDate(message.occurredAt)} – konto: {message.emailAccount.address}
              </p>
              {message.textBody && (
                <p className="mt-1 line-clamp-2 text-slate-500">{message.textBody.slice(0, 240)}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-4">
                {customers.length > 0 && (
                  <form action={assignToCustomer} className="flex items-center gap-2">
                    <input type="hidden" name="messageId" value={message.id} />
                    <select name="customerId" required className="rounded border border-slate-300 px-2 py-1 text-xs">
                      <option value="">Velg kunde …</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                      Tilordne kunde
                    </button>
                  </form>
                )}
                {suppliers.length > 0 && (
                  <form action={assignToSupplier} className="flex items-center gap-2">
                    <input type="hidden" name="messageId" value={message.id} />
                    <select name="supplierId" required className="rounded border border-slate-300 px-2 py-1 text-xs">
                      <option value="">Velg leverandør …</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                      Tilordne leverandør
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
