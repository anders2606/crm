import { redirect } from 'next/navigation';

import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { createSupplier } from './actions';

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.SUPPLIER_WRITE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/suppliers/new');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å opprette leverandører.
          </p>
        </main>
      );
    }
    throw error;
  }

  const showMissingFieldsError = searchParams.error === 'missing_fields';

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">Ny leverandør</h1>

      {showMissingFieldsError && (
        <p className="mb-4 text-sm text-red-600">Navn og land er påkrevd.</p>
      )}

      <form action={createSupplier} className="space-y-4">
        <label className="block text-sm font-medium">
          Navn
          <input name="name" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Land
            <input
              name="country"
              required
              placeholder="f.eks. Italia"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Nettside
            <input name="website" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            E-post
            <input type="email" name="email" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Telefon (med landkode)
            <input name="phone" placeholder="+39 ..." className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="block text-sm font-medium">
            Valuta
            <input name="currency" defaultValue="EUR" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Incoterms
            <input name="incoterms" placeholder="f.eks. EXW" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Betalingsbetingelser (dager)
            <input type="number" name="paymentTermsDays" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="col-span-2 block text-sm font-medium">
            Kredittramme
            <input name="creditLimit" placeholder="f.eks. 10 000,00" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Valuta
            <input name="creditLimitCurrency" defaultValue="EUR" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            IBAN
            <input name="iban" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            BIC/SWIFT
            <input name="bic" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
          Opprett leverandør
        </button>
      </form>
    </main>
  );
}
