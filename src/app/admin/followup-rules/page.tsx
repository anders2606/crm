import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { saveFollowUpRule } from './actions';

export default async function FollowUpRulesPage() {
  try {
    await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/followup-rules');
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

  const [defaultRule, groupRules, customerGroups, followUpTemplates] = await Promise.all([
    prisma.followUpRule.findFirst({ where: { scope: 'DEFAULT' } }),
    prisma.followUpRule.findMany({ where: { scope: 'CUSTOMER_GROUP' }, include: { customerGroup: true } }),
    prisma.customerGroup.findMany({ orderBy: { name: 'asc' } }),
    prisma.template.findMany({ where: { type: 'FOLLOWUP', isCurrent: true }, orderBy: { name: 'asc' } }),
  ]);

  const groupRuleByGroupId = new Map(groupRules.map((rule) => [rule.customerGroupId, rule]));

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <Link href="/admin/templates" className="text-sm text-slate-600 underline">
          ← Maler
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Oppfølgingsregler</h1>
        <p className="text-sm text-slate-600">
          Automatisk oppfølging av sendte tilbud (OP-02–06). Kan overstyres per kunde og per tilbud direkte der man
          jobber med tilbudet.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Standardregel</h2>
        <form action={saveFollowUpRule} className="space-y-4">
          <input type="hidden" name="scope" value="DEFAULT" />
          <label className="block text-sm font-medium">
            Dager etter sending (kommaseparert, f.eks. 7,14)
            <input
              name="daysSequence"
              defaultValue={defaultRule?.daysSequence.join(',') ?? '7,14'}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Mal for påminnelse
            <select
              name="templateId"
              defaultValue={defaultRule?.templateId ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Ingen (enkel standardtekst)</option>
              {followUpTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="active" defaultChecked={defaultRule?.active ?? true} />
            Aktiv
          </label>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Lagre standardregel
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Regler per kundegruppe</h2>
        {customerGroups.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen kundegrupper opprettet ennå.</p>
        ) : (
          <div className="space-y-6">
            {customerGroups.map((group) => {
              const rule = groupRuleByGroupId.get(group.id);
              return (
                <form key={group.id} action={saveFollowUpRule} className="space-y-2 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                  <input type="hidden" name="scope" value="CUSTOMER_GROUP" />
                  <input type="hidden" name="customerGroupId" value={group.id} />
                  <p className="text-sm font-medium">{group.name}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      name="daysSequence"
                      placeholder="Bruk standardregel"
                      defaultValue={rule?.daysSequence.join(',') ?? ''}
                      className="rounded border border-slate-300 px-2 py-1.5"
                    />
                    <select name="templateId" defaultValue={rule?.templateId ?? ''} className="rounded border border-slate-300 px-2 py-1.5">
                      <option value="">Ingen mal</option>
                      {followUpTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" name="active" defaultChecked={rule?.active ?? false} />
                      Aktiv
                    </label>
                    <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                      Lagre
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
