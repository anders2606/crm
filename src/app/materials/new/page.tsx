import { redirect } from 'next/navigation';

import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { MATERIAL_AVAILABILITY_LABELS, MATERIAL_FINISH_LABELS, MATERIAL_TYPE_LABELS } from '@/modules/materials/service';

import { createMaterial } from './actions';

export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.MATERIAL_WRITE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/materials/new');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å registrere materialer.
          </p>
        </main>
      );
    }
    throw error;
  }

  const showMissingNameError = searchParams.error === 'missing_name';

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">Nytt materiale</h1>

      {showMissingNameError && <p className="mb-4 text-sm text-red-600">Navn er påkrevd.</p>}

      <form action={createMaterial} className="space-y-4">
        <label className="block text-sm font-medium">
          Navn
          <input name="name" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">
          Handelsnavn
          <input name="tradeName" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Type
            <select name="type" defaultValue="MARBLE" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              {Object.entries(MATERIAL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Overflatebehandling
            <select name="finish" defaultValue="" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              <option value="">– ikke satt –</option>
              {Object.entries(MATERIAL_FINISH_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Opprinnelsesland/brudd
            <input name="origin" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Farge
            <input name="color" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Tykkelser (mm, kommaseparert)
            <input name="thicknessesMm" placeholder="20, 30" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Platestørrelser (kommaseparert)
            <input
              name="slabSizes"
              placeholder="320x160 cm, 300x140 cm"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Tilgjengelighet
          <select name="availability" defaultValue="AVAILABLE" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            {Object.entries(MATERIAL_AVAILABILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Vedlikeholdsråd
          <textarea name="maintenanceNotes" rows={3} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
          Opprett materiale
        </button>
      </form>
    </main>
  );
}
