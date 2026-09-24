import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { API_SCOPE_LABELS, API_SCOPES, NEW_API_KEY_COOKIE } from '@/lib/api-keys';
import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { createApiKeyAction, revokeApiKeyAction } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Etikett og minst én tilgang er påkrevd.',
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.API_KEYS_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/api-keys');
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
  const newKey = cookies().get(NEW_API_KEY_COOKIE)?.value ?? null;
  const apiKeys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">API-nøkler</h1>
        <p className="text-sm text-slate-600">
          Nøkkelbasert tilgang til det åpne REST-API-et (GE-11), for en fremtidig nettbutikk på marmor.no.
        </p>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_MESSAGES[error] ?? error}</p>}

      {newKey && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-2 font-medium">Ny API-nøkkel opprettet – kopier den nå, den vises ikke igjen:</p>
          <code className="block break-all rounded bg-white px-3 py-2">{newKey}</code>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Ny nøkkel</h2>
        <form action={createApiKeyAction} className="space-y-3 text-sm">
          <label className="block font-medium">
            Etikett (f.eks. «Nettbutikk marmor.no»)
            <input name="label" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <fieldset className="rounded border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-500">Tilganger</legend>
            {Object.values(API_SCOPES).map((scope) => (
              <label key={scope} className="flex items-center gap-2">
                <input type="checkbox" name="scopes" value={scope} />
                {API_SCOPE_LABELS[scope]}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
            Opprett nøkkel
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Eksisterende nøkler</h2>
        {apiKeys.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen nøkler opprettet ennå.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {apiKeys.map((apiKey) => (
              <li key={apiKey.id} className="rounded border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {apiKey.label} {!apiKey.active && <span className="text-red-600">(tilbakekalt)</span>}
                  </span>
                  {apiKey.active && (
                    <form action={revokeApiKeyAction}>
                      <input type="hidden" name="id" value={apiKey.id} />
                      <button type="submit" className="text-xs text-red-600 underline">
                        Tilbakekall
                      </button>
                    </form>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {apiKey.scopes.map((scope) => API_SCOPE_LABELS[scope] ?? scope).join(', ')} · opprettet{' '}
                  {formatDate(apiKey.createdAt)}
                  {apiKey.lastUsedAt ? ` · sist brukt ${formatDate(apiKey.lastUsedAt)}` : ' · aldri brukt'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
