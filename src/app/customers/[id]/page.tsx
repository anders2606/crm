import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DocumentUploadForm } from '@/components/document-upload-form';
import { prisma } from '@/lib/db';
import { listActivities } from '@/lib/activity';
import { formatMoney } from '@/lib/money';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import {
  DOCUMENT_CATEGORY_LABELS,
  formatFileSize,
  isPreviewableInBrowser,
  listDocumentGroupsForEntity,
} from '@/modules/documents/service';
import { INVOICE_PAYMENT_STATUS_LABELS } from '@/modules/poweroffice/payment-status';
import { QUOTE_STATUS_LABELS } from '@/modules/quotes/service';

import {
  addActivity,
  addAddress,
  addConsent,
  addContactPerson,
  completeTask,
  createTask,
  setCustomerFollowUpRule,
  setCustomerGroups,
  updateCustomer,
  uploadDocument,
} from './actions';

const TYPE_LABELS: Record<string, string> = { COMPANY: 'Bedrift', PRIVATE: 'Privat' };
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
const CONSENT_STATUS_LABELS: Record<string, string> = { GIVEN: 'Gitt', WITHDRAWN: 'Trukket' };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMER_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?next=/customers/${params.id}`);
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å se kunder.
          </p>
        </main>
      );
    }
    throw error;
  }

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      addresses: true,
      contactPersons: true,
      consents: { orderBy: { occurredAt: 'desc' } },
      groups: true,
      followUpRule: true,
    },
  });

  if (!customer) {
    notFound();
  }

  const [allGroups, activities, openTasks, users, documentGroups, quotes, orders] = await Promise.all([
    prisma.customerGroup.findMany({ orderBy: { name: 'asc' } }),
    listActivities(ENTITY_TYPES.CUSTOMER, customer.id),
    prisma.task.findMany({
      where: { entityType: ENTITY_TYPES.CUSTOMER, entityId: customer.id, status: 'OPEN' },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    listDocumentGroupsForEntity(ENTITY_TYPES.CUSTOMER, customer.id),
    prisma.quote.findMany({
      where: { customerId: customer.id, isCurrent: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.findMany({
      where: { quote: { customerId: customer.id } },
      include: { quote: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const userNameById = new Map(users.map((user) => [user.id, user.name]));
  const currentGroupIds = new Set(customer.groups.map((group) => group.id));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/customers" className="text-sm text-slate-600 underline">
          ← Kunder
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{customer.name}</h1>
        <p className="text-sm text-slate-600">{TYPE_LABELS[customer.type] ?? customer.type}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Stamdata</h2>
        <form action={updateCustomer} className="space-y-4">
          <input type="hidden" name="customerId" value={customer.id} />
          <fieldset className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="type" value="COMPANY" defaultChecked={customer.type === 'COMPANY'} />
              Bedrift
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="type" value="PRIVATE" defaultChecked={customer.type === 'PRIVATE'} />
              Privat
            </label>
          </fieldset>
          <label className="block text-sm font-medium">
            Navn
            <input
              name="name"
              defaultValue={customer.name}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Organisasjonsnummer
            <input
              name="orgNr"
              defaultValue={customer.orgNr ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              E-post
              <input
                type="email"
                name="email"
                defaultValue={customer.email ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Telefon
              <input
                name="phone"
                defaultValue={customer.phone ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <label className="col-span-2 block text-sm font-medium">
              Kredittgrense
              <input
                name="creditLimit"
                defaultValue={
                  customer.creditLimitCents !== null
                    ? (customer.creditLimitCents / 100).toString().replace('.', ',')
                    : ''
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Valuta
              <input
                name="creditLimitCurrency"
                defaultValue={customer.creditLimitCurrency}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Betalingsbetingelser (dager)
            <input
              type="number"
              name="paymentTermsDays"
              defaultValue={customer.paymentTermsDays ?? ''}
              className="mt-1 w-full max-w-[8rem] rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <p className="text-xs text-slate-500">
            {customer.creditLimitCents !== null && (
              <>Nåværende kredittgrense: {formatMoney(customer.creditLimitCents, customer.creditLimitCurrency)}. </>
            )}
            {customer.balanceSyncedAt ? (
              <>
                Utestående saldo (PowerOffice, {new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(customer.balanceSyncedAt)}):{' '}
                {formatMoney(customer.outstandingBalanceMinor ?? 0, customer.creditLimitCurrency)}
                {(customer.overdueAmountMinor ?? 0) > 0 && (
                  <> (herav {formatMoney(customer.overdueAmountMinor!, customer.creditLimitCurrency)} forfalt)</>
                )}
                .
              </>
            ) : (
              <>Utestående saldo hentes fra PowerOffice (KU-03) – ikke synket ennå.</>
            )}
          </p>
          {customer.creditLimitCents !== null &&
            customer.outstandingBalanceMinor !== null &&
            customer.outstandingBalanceMinor > customer.creditLimitCents && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                Kredittgrensen er overskredet: utestående saldo (
                {formatMoney(customer.outstandingBalanceMinor, customer.creditLimitCurrency)}) er høyere enn
                kredittgrensen ({formatMoney(customer.creditLimitCents, customer.creditLimitCurrency)}) (KU-03).
              </p>
            )}
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Lagre
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Kontaktpersoner</h2>
        {customer.contactPersons.length > 0 ? (
          <ul className="mb-4 space-y-2 text-sm">
            {customer.contactPersons.map((contact) => (
              <li key={contact.id} className="rounded border border-slate-100 px-3 py-2">
                <span className="font-medium">{contact.name}</span>
                {contact.role ? ` – ${contact.role}` : ''}
                {contact.email ? ` – ${contact.email}` : ''}
                {contact.phone ? ` – ${contact.phone}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen kontaktpersoner registrert.</p>
        )}
        <form action={addContactPerson} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="customerId" value={customer.id} />
          <input name="name" placeholder="Navn" required className="rounded border border-slate-300 px-3 py-2" />
          <input name="role" placeholder="Rolle" className="rounded border border-slate-300 px-3 py-2" />
          <input name="email" type="email" placeholder="E-post" className="rounded border border-slate-300 px-3 py-2" />
          <input name="phone" placeholder="Telefon" className="rounded border border-slate-300 px-3 py-2" />
          <button type="submit" className="col-span-2 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Legg til kontaktperson
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Adresser</h2>
        {customer.addresses.length > 0 ? (
          <ul className="mb-4 space-y-2 text-sm">
            {customer.addresses.map((address) => (
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
          <input type="hidden" name="customerId" value={customer.id} />
          <select name="type" className="rounded border border-slate-300 px-3 py-2" defaultValue="VISIT">
            <option value="VISIT">Besøksadresse</option>
            <option value="INVOICE">Fakturaadresse</option>
            <option value="DELIVERY">Leveringsadresse</option>
          </select>
          <input name="country" placeholder="Land (f.eks. NO)" defaultValue="NO" className="rounded border border-slate-300 px-3 py-2" />
          <input name="street" placeholder="Gate/adresse" required className="col-span-2 rounded border border-slate-300 px-3 py-2" />
          <input name="postalCode" placeholder="Postnummer" required className="rounded border border-slate-300 px-3 py-2" />
          <input name="city" placeholder="Poststed" required className="rounded border border-slate-300 px-3 py-2" />
          <button type="submit" className="col-span-2 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Legg til adresse
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Tilbud</h2>
          <Link href={`/quotes/new?customerId=${customer.id}`} className="text-sm underline">
            Nytt tilbud
          </Link>
        </div>
        {quotes.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen tilbud registrert ennå.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {quotes.map((quote) => (
              <li key={quote.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
                <Link href={`/quotes/${quote.id}`} className="underline">
                  {quote.number}
                </Link>
                <span className="text-slate-600">
                  {formatMoney(quote.totalMinor, quote.currency)} · {QUOTE_STATUS_LABELS[quote.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {orders.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Ordre og betalingsstatus (IN-12)</h2>
          <ul className="space-y-1 text-sm">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
                <Link href={`/orders/${order.id}`} className="underline">
                  {order.number}
                </Link>
                <span className="text-slate-600">
                  {order.paymentStatus
                    ? INVOICE_PAYMENT_STATUS_LABELS[order.paymentStatus]
                    : order.transferredToPowerOffice
                      ? 'Ikke fakturert ennå'
                      : 'Ikke overført til PowerOffice ennå'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Oppfølging (OP-05)</h2>
        <p className="mb-4 text-sm text-slate-600">
          Overstyrer standardregelen (og eventuell kundegruppe-regel) for automatisk oppfølging av tilbud sendt til
          denne kunden. La feltet stå tomt for å bruke standardregelen.
        </p>
        <form action={setCustomerFollowUpRule} className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="customerId" value={customer.id} />
          <input
            name="daysSequence"
            placeholder="Bruk standardregel"
            defaultValue={customer.followUpRule?.daysSequence.join(',') ?? ''}
            className="rounded border border-slate-300 px-2 py-1.5"
          />
          <label className="flex items-center gap-1">
            <input type="checkbox" name="active" defaultChecked={customer.followUpRule?.active ?? false} />
            Aktiv
          </label>
          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Lagre
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Dokumenter</h2>
        {documentGroups.length > 0 ? (
          <ul className="mb-6 space-y-4 text-sm">
            {documentGroups.map((group) => (
              <li key={group.groupId} className="rounded border border-slate-100 p-3">
                <div>
                  <a
                    href={`/api/documents/${group.current.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    {group.current.fileName}
                  </a>
                  <span className="ml-2 text-slate-500">
                    {DOCUMENT_CATEGORY_LABELS[group.current.category]} – v{group.current.version}{' '}
                    (gjeldende) – {formatFileSize(group.current.sizeBytes)}
                  </span>
                </div>

                {isPreviewableInBrowser(group.current.mimeType) &&
                  (group.current.mimeType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/documents/${group.current.id}/file`}
                      alt={group.current.fileName}
                      className="mt-2 max-h-48 rounded border border-slate-200"
                    />
                  ) : (
                    <embed
                      src={`/api/documents/${group.current.id}/file`}
                      type="application/pdf"
                      className="mt-2 h-64 w-full rounded border border-slate-200"
                    />
                  ))}

                {group.previousVersions.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-600">
                      Tidligere versjoner ({group.previousVersions.length})
                    </summary>
                    <ul className="mt-1 space-y-1 pl-4 text-xs">
                      {group.previousVersions.map((version) => (
                        <li key={version.id}>
                          <a
                            href={`/api/documents/${version.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            v{version.version} – {version.fileName}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-600">Last opp ny versjon</summary>
                  <div className="mt-2">
                    <DocumentUploadForm
                      action={uploadDocument}
                      hiddenFields={{ customerId: customer.id, replacesDocumentId: group.current.id }}
                      showCategory={false}
                      submitLabel="Last opp ny versjon"
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-6 text-sm text-slate-600">Ingen dokumenter lastet opp ennå.</p>
        )}
        <DocumentUploadForm action={uploadDocument} hiddenFields={{ customerId: customer.id }} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Kundegrupper</h2>
          <Link href="/customers/groups" className="text-xs text-slate-600 underline">
            Administrer grupper
          </Link>
        </div>
        {allGroups.length > 0 ? (
          <form action={setCustomerGroups} className="space-y-3 text-sm">
            <input type="hidden" name="customerId" value={customer.id} />
            <div className="grid grid-cols-2 gap-2">
              {allGroups.map((group) => (
                <label key={group.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={group.id}
                    defaultChecked={currentGroupIds.has(group.id)}
                  />
                  {group.name}
                </label>
              ))}
            </div>
            <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
              Lagre grupper
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-600">
            Ingen kundegrupper opprettet ennå. <Link href="/customers/groups" className="underline">Opprett en her</Link>.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Samtykke til nyhetsbrev/markedsføring</h2>
        {customer.emailBounced && (
          <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            E-postadressen har gitt permanent retur (bounce){customer.emailBouncedAt ? ` ${formatDate(customer.emailBouncedAt)}` : ''} og
            utelates fra kampanjeutsendelser (GR-07). Rett adressen over for å inkludere kunden igjen.
          </p>
        )}
        {customer.consents.length > 0 ? (
          <ul className="mb-4 space-y-2 text-sm">
            {customer.consents.map((consent) => (
              <li key={consent.id} className="rounded border border-slate-100 px-3 py-2">
                <span className="font-medium">{CONSENT_STATUS_LABELS[consent.status]}</span> – {consent.channel} –{' '}
                {formatDate(consent.occurredAt)}
                {consent.source ? ` – kilde: ${consent.source}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen samtykke registrert.</p>
        )}
        <form action={addConsent} className="grid grid-cols-3 gap-3 text-sm">
          <input type="hidden" name="customerId" value={customer.id} />
          <input name="channel" placeholder="Kanal (f.eks. nyhetsbrev)" required className="col-span-2 rounded border border-slate-300 px-3 py-2" />
          <select name="status" className="rounded border border-slate-300 px-3 py-2" defaultValue="GIVEN">
            <option value="GIVEN">Gitt</option>
            <option value="WITHDRAWN">Trukket</option>
          </select>
          <input name="source" placeholder="Kilde" className="col-span-3 rounded border border-slate-300 px-3 py-2" />
          <button type="submit" className="col-span-3 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Registrer samtykke
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
                  <input type="hidden" name="customerId" value={customer.id} />
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
          <input type="hidden" name="customerId" value={customer.id} />
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
          <input type="hidden" name="customerId" value={customer.id} />
          <select name="type" className="rounded border border-slate-300 px-3 py-2" defaultValue="NOTE">
            <option value="NOTE">Notat</option>
            <option value="CALL">Telefonsamtale</option>
            <option value="MEETING">Møte</option>
          </select>
          <input
            name="text"
            placeholder="Hva ble sagt/gjort?"
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
