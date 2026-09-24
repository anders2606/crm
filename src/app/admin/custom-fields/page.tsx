import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  listFieldDefinitions,
} from '@/modules/custom-fields/service';

import { createFieldDefinitionAction, deleteFieldDefinitionAction } from '@/modules/custom-fields/actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing_label: 'Feltet må ha en etikett.',
};

export default async function CustomFieldsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.CUSTOM_FIELDS_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/custom-fields');
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

  const error = typeof searchParams.error === 'string' ? searchParams.error : null;
  const definitionsByEntityType = await Promise.all(
    CUSTOM_FIELD_ENTITY_TYPES.map(async (entity) => ({
      ...entity,
      definitions: await listFieldDefinitions(entity.value),
    })),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Egendefinerte felt</h1>
        <p className="text-sm text-slate-600">
          Legg til felt på kunder, leverandører, tilbud og ordre uten hjelp fra utvikler (GE-09).
        </p>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_MESSAGES[error] ?? error}</p>}

      {definitionsByEntityType.map((entity) => (
        <section key={entity.value} className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-medium">{entity.label}</h2>

          {entity.definitions.length > 0 && (
            <ul className="mb-4 space-y-2 text-sm">
              {entity.definitions.map((definition) => (
                <li
                  key={definition.id}
                  className="flex items-center justify-between rounded border border-slate-100 px-3 py-2"
                >
                  <span>
                    {definition.label}{' '}
                    <span className="text-slate-500">
                      ({CUSTOM_FIELD_TYPE_LABELS[definition.fieldType]}
                      {definition.fieldType === 'SELECT' ? `: ${definition.options.join(', ')}` : ''})
                    </span>
                  </span>
                  <form action={deleteFieldDefinitionAction}>
                    <input type="hidden" name="id" value={definition.id} />
                    <button type="submit" className="text-xs text-red-600 underline">
                      Slett
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={createFieldDefinitionAction} className="grid grid-cols-4 gap-3 text-sm">
            <input type="hidden" name="entityType" value={entity.value} />
            <input
              name="label"
              placeholder="Etikett (f.eks. Fargekode)"
              required
              className="col-span-2 rounded border border-slate-300 px-3 py-2"
            />
            <select name="fieldType" className="rounded border border-slate-300 px-3 py-2" defaultValue="TEXT">
              {Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-50">
              Legg til
            </button>
            <input
              name="options"
              placeholder="Valg for valgliste, kommaseparert (kun for «Valgliste»)"
              className="col-span-4 rounded border border-slate-300 px-3 py-2"
            />
          </form>
        </section>
      ))}
    </main>
  );
}
