// GE-09: gjenbrukbar seksjon som viser og lar brukeren redigere de
// egendefinerte feltene administrator har opprettet for en gitt entitet
// (kunde/leverandør/tilbud/ordre). Ingen effekt hvis ingen felt er definert.
import { saveCustomFieldValuesAction } from '@/modules/custom-fields/actions';
import { loadCustomFieldsForEntity } from '@/modules/custom-fields/service';

export async function CustomFieldsSection({ entityType, entityId }: { entityType: string; entityId: string }) {
  const fields = await loadCustomFieldsForEntity(entityType, entityId);
  if (fields.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-4 font-medium">Egendefinerte felt</h2>
      <form action={saveCustomFieldValuesAction} className="space-y-3 text-sm">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        {fields.map(({ definition, value }) => {
          const name = `customField__${definition.key}`;
          return (
            <label key={definition.id} className="block font-medium">
              {definition.label}
              {definition.fieldType === 'TEXT' && (
                <input
                  name={name}
                  defaultValue={value ?? ''}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                />
              )}
              {definition.fieldType === 'NUMBER' && (
                <input
                  type="number"
                  step="any"
                  name={name}
                  defaultValue={value ?? ''}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                />
              )}
              {definition.fieldType === 'DATE' && (
                <input
                  type="date"
                  name={name}
                  defaultValue={value ?? ''}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                />
              )}
              {definition.fieldType === 'BOOLEAN' && (
                <span className="mt-1 flex items-center gap-2 font-normal">
                  <input type="hidden" name={name} value="false" />
                  <input type="checkbox" name={name} value="true" defaultChecked={value === 'true'} />
                  Ja
                </span>
              )}
              {definition.fieldType === 'SELECT' && (
                <select
                  name={name}
                  defaultValue={value ?? ''}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                >
                  <option value="">(ingen)</option>
                  {definition.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </label>
          );
        })}
        <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
          Lagre
        </button>
      </form>
    </section>
  );
}
