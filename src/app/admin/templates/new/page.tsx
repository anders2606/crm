import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { TEMPLATE_TYPE_LABELS } from '@/modules/templates/service';

import { createTemplate } from '../actions';

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/templates/new');
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

  const customerGroups = await prisma.customerGroup.findMany({ orderBy: { name: 'asc' } });
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/admin/templates" className="text-sm text-slate-600 underline">
        ← Maler
      </Link>
      <h1 className="mt-1 mb-6 text-xl font-semibold">Ny mal</h1>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">Fyll ut alle påkrevde felt.</p>}

      <form action={createTemplate} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <label className="block text-sm font-medium">
          Type
          <select name="type" required defaultValue="" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="" disabled>
              Velg type
            </option>
            {Object.entries(TEMPLATE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          Navn
          <input name="name" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Språk
            <select name="language" defaultValue="nb" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              <option value="nb">Norsk</option>
              <option value="en">Engelsk</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Kundegruppe (valgfritt)
            <select name="customerGroupId" defaultValue="" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
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
          Emne (kun for e-post/nyhetsbrev; flettefelt kan brukes)
          <input name="subject" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>

        <label className="block text-sm font-medium">
          Innhold (ren tekst, flettefelt settes inn av systemet ved sending)
          <textarea
            name="content"
            required
            rows={12}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </label>

        <label className="block text-sm font-medium">
          Status
          <select name="status" defaultValue="DRAFT" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="DRAFT">Kladd</option>
            <option value="PUBLISHED">Publisert</option>
          </select>
        </label>

        <label className="block text-sm font-medium">
          Kommentar til denne versjonen
          <input name="comment" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>

        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          Opprett mal
        </button>
      </form>
    </main>
  );
}
