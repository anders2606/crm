import { redirect } from 'next/navigation';

import { getPendingAuth } from '@/lib/auth/pending';
import { getSession } from '@/lib/auth/session';
import { buildOtpAuthUri } from '@/lib/auth/totp';

import { loginWithPassword, verifyTotpCode } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'Feil e-post eller passord.',
  invalid_code: 'Feil kode. Prøv igjen.',
  expired: 'Økten utløp. Logg inn på nytt.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSession();
  if (session) {
    redirect('/');
  }

  const next = typeof searchParams.next === 'string' ? searchParams.next : '/';
  const errorCode = typeof searchParams.error === 'string' ? searchParams.error : undefined;
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const pending = await getPendingAuth();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Pietra Unica CRM</h1>

        {pending ? (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Skriv inn den 6-sifrede koden fra autentiseringsappen din.
            </p>
            {pending.needsEnrollment && (
              <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="mb-2">
                  Kontoen din har ikke to-faktorautentisering ennå. Legg til denne nøkkelen i en
                  autentiseringsapp (f.eks. Apple Kodegenerator eller Google Authenticator), og
                  bekreft med koden appen viser:
                </p>
                <code className="block break-all rounded bg-white px-2 py-1 text-xs">
                  {pending.totpSecret}
                </code>
                <p className="mt-2 mb-1">Eller lim inn denne oppsettslenken direkte i appen:</p>
                <code className="block break-all rounded bg-white px-2 py-1 text-xs">
                  {buildOtpAuthUri(pending.totpSecret, pending.email)}
                </code>
              </div>
            )}
            <form action={verifyTotpCode} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <label className="block text-sm font-medium">
                6-sifret kode
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 tracking-widest"
                />
              </label>
              {errorMessage && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage}
                </p>
              )}
              <button
                type="submit"
                className="w-full rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
              >
                Bekreft
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-600">Logg inn med brukernavn og passord.</p>
            <form action={loginWithPassword} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <label className="block text-sm font-medium">
                E-post
                <input
                  type="email"
                  name="email"
                  required
                  autoFocus
                  autoComplete="username"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium">
                Passord
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              {errorMessage && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage}
                </p>
              )}
              <button
                type="submit"
                className="w-full rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
              >
                Logg inn
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
