import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { createCampaignAction } from '../actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Navn, mal og e-postkonto er påkrevd.',
};

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.CAMPAIGN_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/campaigns/new');
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

  const [templates, emailAccounts, customerGroups, materials] = await Promise.all([
    prisma.template.findMany({
      where: { type: 'NEWSLETTER', isCurrent: true, status: 'PUBLISHED' },
      orderBy: { name: 'asc' },
    }),
    prisma.emailAccount.findMany({ where: { active: true }, orderBy: { address: 'asc' } }),
    prisma.customerGroup.findMany({ orderBy: { name: 'asc' } }),
    prisma.material.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const error = typeof searchParams.error === 'string' ? searchParams.error : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href="/admin/campaigns" className="text-sm text-slate-600 underline">
        ← Kampanjer
      </Link>
      <h1 className="mb-6 mt-1 text-xl font-semibold">Ny kampanje</h1>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_MESSAGES[error] ?? error}</p>}

      {templates.length === 0 ? (
        <p className="text-sm text-slate-600">
          Ingen publiserte nyhetsbrevmaler ennå. Opprett en under{' '}
          <Link href="/admin/templates/new" className="underline">
            Maler
          </Link>{' '}
          (type «Nyhetsbrev») først.
        </p>
      ) : (
        <form action={createCampaignAction} className="space-y-4 text-sm">
          <label className="block font-medium">
            Navn (internt, vises ikke til mottaker)
            <input name="name" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>

          <label className="block font-medium">
            Mal
            <select name="templateId" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.language})
                </option>
              ))}
            </select>
          </label>

          <label className="block font-medium">
            Send fra
            <select name="emailAccountId" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              {emailAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.address}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="rounded border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-500">Kundegrupper (tomt = alle kunder)</legend>
            {customerGroups.length === 0 ? (
              <p className="text-slate-600">Ingen kundegrupper opprettet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {customerGroups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2">
                    <input type="checkbox" name="customerGroupIds" value={group.id} />
                    {group.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="rounded border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-500">Filtre (valgfritt, kombineres)</legend>
            <div className="space-y-3">
              <label className="block">
                Kjøpt siste antall dager
                <input
                  type="number"
                  name="filterPurchasedWithinDays"
                  placeholder="f.eks. 365"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                Land (geografisk område)
                <input
                  name="filterCountry"
                  placeholder="f.eks. NO"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                Materialinteresse
                <select name="filterMaterialId" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                  <option value="">(ingen)</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <label className="block font-medium">
            Planlagt utsendelsestidspunkt (valgfritt – tom = sendes umiddelbart når lagt i kø)
            <input type="datetime-local" name="scheduledAt" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>

          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
            Opprett kladd
          </button>
        </form>
      )}
    </main>
  );
}
