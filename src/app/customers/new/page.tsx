import { redirect } from 'next/navigation';

import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { findPotentialDuplicateCustomers } from '@/modules/customers/duplicate-check';

import { createCustomer } from './actions';

function paramStr(value: string | string[] | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMER_WRITE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/customers/new');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å opprette kunder.
          </p>
        </main>
      );
    }
    throw error;
  }

  const type = paramStr(searchParams.type, 'COMPANY');
  const name = paramStr(searchParams.name);
  const orgNr = paramStr(searchParams.orgNr);
  const email = paramStr(searchParams.email);
  const phone = paramStr(searchParams.phone);
  const creditLimit = paramStr(searchParams.creditLimit);
  const creditLimitCurrency = paramStr(searchParams.creditLimitCurrency, 'NOK');
  const paymentTermsDays = paramStr(searchParams.paymentTermsDays);
  const showDuplicateWarning = searchParams.duplicate === '1';
  const showMissingNameError = searchParams.error === 'missing_name';

  const duplicates = showDuplicateWarning
    ? await findPotentialDuplicateCustomers({ name, email: email || null, orgNr: orgNr || null })
    : [];

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">Ny kunde</h1>

      {showDuplicateWarning && duplicates.length > 0 && (
        <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Mulig duplikat funnet (KU-10):</p>
          <ul className="mt-2 list-disc pl-5">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id}>
                {duplicate.name}
                {duplicate.orgNr ? ` – org.nr. ${duplicate.orgNr}` : ''}
                {duplicate.email ? ` – ${duplicate.email}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Kontroller om dette allerede er registrert. Trykk «Opprett likevel» for å registrere
            som ny kunde.
          </p>
        </div>
      )}

      {showMissingNameError && <p className="mb-4 text-sm text-red-600">Navn er påkrevd.</p>}

      <form action={createCustomer} className="space-y-4">
        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-1 font-medium">Type</legend>
          <label className="flex items-center gap-1">
            <input type="radio" name="type" value="COMPANY" defaultChecked={type !== 'PRIVATE'} />
            Bedrift
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="type" value="PRIVATE" defaultChecked={type === 'PRIVATE'} />
            Privat
          </label>
        </fieldset>

        <label className="block text-sm font-medium">
          Navn
          <input
            name="name"
            defaultValue={name}
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium">
          Organisasjonsnummer
          <input
            name="orgNr"
            defaultValue={orgNr}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            E-post
            <input
              type="email"
              name="email"
              defaultValue={email}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Telefon
            <input
              name="phone"
              defaultValue={phone}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="col-span-2 block text-sm font-medium">
            Kredittgrense
            <input
              name="creditLimit"
              defaultValue={creditLimit}
              placeholder="f.eks. 50 000,00"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Valuta
            <input
              name="creditLimitCurrency"
              defaultValue={creditLimitCurrency}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm font-medium">
          Betalingsbetingelser (dager)
          <input
            type="number"
            name="paymentTermsDays"
            defaultValue={paymentTermsDays}
            className="mt-1 w-full max-w-[8rem] rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
          >
            Opprett kunde
          </button>
          {showDuplicateWarning && duplicates.length > 0 && (
            <button
              type="submit"
              name="confirmDuplicate"
              value="1"
              className="rounded border border-amber-400 px-4 py-2 text-amber-900 hover:bg-amber-50"
            >
              Opprett likevel
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
