import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { listActivities } from '@/lib/activity';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { addActivity, addAddress, addContactPerson, completeTask, createTask, updateSupplier } from './actions';

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  VISIT: 'Besøksadresse',
  INVOICE: 'Fakturaadresse',
  DELIVERY: 'Leveringsadresse',
};
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  NOTE: 'Notat',
  CALL: 'Telefonsamtale',
  MEETING: 'Møte',
  STATUS: 'Status',
  EMAIL: 'E-post',
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.SUPPLIER_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?next=/suppliers/${params.id}`);
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å se leverandører.
          </p>
        </main>
      );
    }
    throw error;
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { addresses: true, contactPersons: true },
  });

  if (!supplier) {
    notFound();
  }

  const [activities, openTasks, users] = await Promise.all([
    listActivities(ENTITY_TYPES.SUPPLIER, supplier.id),
    prisma.task.findMany({
      where: { entityType: ENTITY_TYPES.SUPPLIER, entityId: supplier.id, status: 'OPEN' },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);

  const userNameById = new Map(users.map((user) => [user.id, user.name]));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/suppliers" className="text-sm text-slate-600 underline">
          ← Leverandører
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{supplier.name}</h1>
        <p className="text-sm text-slate-600">{supplier.country}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Stamdata</h2>
        <form action={updateSupplier} className="space-y-4">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <label className="block text-sm font-medium">
            Navn
            <input
              name="name"
              defaultValue={supplier.name}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              Land
              <input
                name="country"
                defaultValue={supplier.country}
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Nettside
              <input
                name="website"
                defaultValue={supplier.website ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              E-post
              <input
                type="email"
                name="email"
                defaultValue={supplier.email ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Telefon
              <input
                name="phone"
                defaultValue={supplier.phone ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <label className="block text-sm font-medium">
              Valuta
              <input
                name="currency"
                defaultValue={supplier.currency}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Incoterms
              <input
                name="incoterms"
                defaultValue={supplier.incoterms ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Betalingsbetingelser (dager)
              <input
                type="number"
                name="paymentTermsDays"
                defaultValue={supplier.paymentTermsDays ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <label className="col-span-2 block text-sm font-medium">
              Kredittramme
              <input
                name="creditLimit"
                defaultValue={
                  supplier.creditLimitCents !== null
                    ? (supplier.creditLimitCents / 100).toString().replace('.', ',')
                    : ''
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Valuta
              <input
                name="creditLimitCurrency"
                defaultValue={supplier.creditLimitCurrency}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              IBAN
              <input
                name="iban"
                defaultValue={supplier.iban ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              BIC/SWIFT
              <input
                name="bic"
                defaultValue={supplier.bic ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          {supplier.creditLimitCents !== null && (
            <p className="text-xs text-slate-500">
              Nåværende kredittramme: {formatMoney(supplier.creditLimitCents, supplier.creditLimitCurrency)}.
              Bankinformasjon synkroniseres med PowerOffice fra M6.
            </p>
          )}
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Lagre
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Kontaktpersoner</h2>
        {supplier.contactPersons.length > 0 ? (
          <ul className="mb-4 space-y-2 text-sm">
            {supplier.contactPersons.map((contact) => (
              <li key={contact.id} className="rounded border border-slate-100 px-3 py-2">
                <span className="font-medium">{contact.name}</span>
                {contact.role ? ` – ${contact.role}` : ''}
                {contact.email ? ` – ${contact.email}` : ''}
                {contact.phone ? ` – ${contact.phone}` : ''}
                {contact.language ? ` – språk: ${contact.language}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen kontaktpersoner registrert.</p>
        )}
        <form action={addContactPerson} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <input name="name" placeholder="Navn" required className="rounded border border-slate-300 px-3 py-2" />
          <input name="role" placeholder="Rolle (salg/logistikk/økonomi)" className="rounded border border-slate-300 px-3 py-2" />
          <input name="email" type="email" placeholder="E-post" className="rounded border border-slate-300 px-3 py-2" />
          <input name="phone" placeholder="Telefon" className="rounded border border-slate-300 px-3 py-2" />
          <input name="language" placeholder="Språk (f.eks. it)" className="col-span-2 rounded border border-slate-300 px-3 py-2" />
          <button type="submit" className="col-span-2 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Legg til kontaktperson
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Adresser</h2>
        {supplier.addresses.length > 0 ? (
          <ul className="mb-4 space-y-2 text-sm">
            {supplier.addresses.map((address) => (
              <li key={address.id} className="rounded border border-slate-100 px-3 py-2">
                <span className="font-medium">{ADDRESS_TYPE_LABELS[address.type] ?? address.type}:</span>{' '}
                {address.street}, {address.postalCode} {address.city}, {address.country}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen adresser registrert.</p>
        )}
        <form action={addAddress} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <select name="type" className="rounded border border-slate-300 px-3 py-2" defaultValue="VISIT">
            <option value="VISIT">Besøksadresse</option>
            <option value="INVOICE">Fakturaadresse</option>
          </select>
          <input name="country" placeholder="Land" defaultValue={supplier.country} className="rounded border border-slate-300 px-3 py-2" />
          <input name="street" placeholder="Gate/adresse" required className="col-span-2 rounded border border-slate-300 px-3 py-2" />
          <input name="postalCode" placeholder="Postnummer" required className="rounded border border-slate-300 px-3 py-2" />
          <input name="city" placeholder="By" required className="rounded border border-slate-300 px-3 py-2" />
          <button type="submit" className="col-span-2 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Legg til adresse
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Oppgaver</h2>
        {openTasks.length > 0 ? (
          <ul className="mb-4 space-y-2 text-sm">
            {openTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
                <span>
                  {task.title}
                  {task.dueAt ? ` – frist ${formatDate(task.dueAt)}` : ''} – ansvarlig:{' '}
                  {userNameById.get(task.assigneeId) ?? 'ukjent'}
                </span>
                <form action={completeTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="supplierId" value={supplier.id} />
                  <button type="submit" className="text-xs text-slate-600 underline">
                    Fullfør
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen åpne oppgaver.</p>
        )}
        <form action={createTask} className="grid grid-cols-3 gap-3 text-sm">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <input name="title" placeholder="Oppgave" required className="col-span-2 rounded border border-slate-300 px-3 py-2" />
          <input type="datetime-local" name="dueAt" className="rounded border border-slate-300 px-3 py-2" />
          <button type="submit" className="col-span-3 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Legg til oppgave (meg selv som ansvarlig)
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Tidslinje</h2>
        {activities.length > 0 ? (
          <ul className="mb-4 space-y-2 text-sm">
            {activities.map((activity) => (
              <li key={activity.id} className="rounded border border-slate-100 px-3 py-2">
                <span className="font-medium">{ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type}</span> –{' '}
                {formatDate(activity.occurredAt)}
                {activity.createdById ? ` – ${userNameById.get(activity.createdById) ?? 'ukjent'}` : ''}
                <p className="mt-1 text-slate-700">{activity.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen aktivitet registrert ennå.</p>
        )}
        <form action={addActivity} className="grid grid-cols-3 gap-3 text-sm">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <select name="type" className="rounded border border-slate-300 px-3 py-2" defaultValue="NOTE">
            <option value="NOTE">Notat</option>
            <option value="CALL">Telefonsamtale</option>
            <option value="MEETING">Møte</option>
          </select>
          <input
            name="text"
            placeholder="Hva ble sagt/gjort? (kvalitet, leveringstid, erfaringer …)"
            required
            className="col-span-2 rounded border border-slate-300 px-3 py-2"
          />
          <button type="submit" className="col-span-3 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Registrer
          </button>
        </form>
      </section>
    </main>
  );
}
