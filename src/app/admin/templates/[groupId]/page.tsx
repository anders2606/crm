import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { TEMPLATE_STATUS_LABELS, TEMPLATE_TYPE_LABELS } from '@/modules/templates/service';

import { createTemplateNewVersion, restoreTemplateVersion } from '../actions';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default async function TemplateDetailPage({
  params,
  searchParams,
}: {
  params: { groupId: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?next=/admin/templates/${params.groupId}`);
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

  const versions = await prisma.template.findMany({
    where: { groupId: params.groupId },
    orderBy: { version: 'desc' },
    include: { customerGroup: true },
  });

  const current = versions.find((v) => v.isCurrent);
  if (!current) {
    notFound();
  }

  const customerGroups = await prisma.customerGroup.findMany({ orderBy: { name: 'asc' } });
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <Link href="/admin/templates" className="text-sm text-slate-600 underline">
          ← Maler
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{current.name}</h1>
        <p className="text-sm text-slate-600">
          {TEMPLATE_TYPE_LABELS[current.type]} · {current.language}
          {current.customerGroup ? ` · ${current.customerGroup.name}` : ' · alle kundegrupper'} · gjeldende versjon{' '}
          {current.version}
        </p>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">Fyll ut alle påkrevde felt.</p>}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Rediger (lagres som ny versjon, SD-03)</h2>
        <p className="mb-4 text-xs text-slate-500">
          Endringer her påvirker kun nye tilbud/e-poster fra nå av. Tilbud som allerede er sendt beholder vilkårene
          som gjaldt da de ble sendt (SD-04).
        </p>
        <form action={createTemplateNewVersion} className="space-y-4">
          <input type="hidden" name="groupId" value={params.groupId} />
          <input type="hidden" name="replacesTemplateId" value={current.id} />
          <input type="hidden" name="type" value={current.type} />

          <label className="block text-sm font-medium">
            Navn
            <input
              name="name"
              required
              defaultValue={current.name}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              Språk
              <select
                name="language"
                defaultValue={current.language}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="nb">Norsk</option>
                <option value="en">Engelsk</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Kundegruppe
              <select
                name="customerGroupId"
                defaultValue={current.customerGroupId ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Alle kundegrupper</option>
                {customerGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium">
            Innhold
            <textarea
              name="content"
              required
              rows={12}
              defaultValue={current.content}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </label>

          <label className="block text-sm font-medium">
            Status
            <select
              name="status"
              defaultValue={current.status}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="DRAFT">Kladd</option>
              <option value="PUBLISHED">Publisert</option>
            </select>
          </label>

          <label className="block text-sm font-medium">
            Kommentar til denne versjonen
            <input name="comment" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>

          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Lagre som ny versjon
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Versjonshistorikk (SD-03)</h2>
        <ul className="space-y-2">
          {versions.map((version) => (
            <li key={version.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  Versjon {version.version} {version.isCurrent && <span className="text-emerald-600">(gjeldende)</span>}
                </p>
                <p className="text-xs text-slate-500">{TEMPLATE_STATUS_LABELS[version.status]}</p>
              </div>
              <p className="text-xs text-slate-500">{formatDate(version.createdAt)}</p>
              {version.comment && <p className="mt-1 text-slate-600">{version.comment}</p>}
              {!version.isCurrent && (
                <form action={restoreTemplateVersion} className="mt-2">
                  <input type="hidden" name="versionId" value={version.id} />
                  <button type="submit" className="text-xs text-slate-600 underline">
                    Gjenopprett denne versjonen
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
