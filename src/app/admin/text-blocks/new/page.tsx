import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { createTextBlock } from '../actions';

export default async function NewTextBlockPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/text-blocks/new');
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/admin/text-blocks" className="text-sm text-slate-600 underline">
        ← Tekstblokker
      </Link>
      <h1 className="mt-1 mb-6 text-xl font-semibold">Ny tekstblokk</h1>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">Fyll ut alle påkrevde felt.</p>}

      <form action={createTextBlock} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <label className="block text-sm font-medium">
          Navn
          <input name="name" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>

        <label className="block text-sm font-medium">
          Språk
          <select name="language" defaultValue="nb" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="nb">Norsk</option>
            <option value="en">Engelsk</option>
          </select>
        </label>

        <label className="block text-sm font-medium">
          Innhold
          <textarea name="content" required rows={8} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>

        <label className="block text-sm font-medium">
          Kommentar
          <input name="comment" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>

        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          Opprett tekstblokk
        </button>
      </form>
    </main>
  );
}
