import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { importAllFromPowerOfficeAction, lookupOrgNrAction, savePowerOfficeSettings } from './actions';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_environment: 'Velg et gyldig miljø.',
  missing_org_nr: 'Skriv inn et organisasjonsnummer.',
};

const NOTICE_MESSAGES: Record<string, string> = {
  import_queued: 'Henting av alle kunder/leverandører er lagt i kø – se synkroniseringsloggen under.',
  lookup_queued: 'Oppslaget er lagt i kø – se synkroniseringsloggen under.',
};

export default async function PowerOfficeSettingsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.POWEROFFICE_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/poweroffice');
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

  const [settings, recentLogs] = await Promise.all([
    prisma.powerOfficeSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.syncLog.findMany({
      where: { integration: 'poweroffice' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const error = typeof searchParams.error === 'string' ? searchParams.error : null;
  const notice = typeof searchParams.notice === 'string' ? searchParams.notice : null;
  const isProduction = settings?.environment === 'PRODUCTION';

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">PowerOffice-tilkobling</h1>
        <p className="text-sm text-slate-600">
          Toveis synk av kunder/leverandører, overføring av ordre til fakturering, og reskontro
          (IN-01–04, IN-23).
        </p>
      </div>

      <div
        className={`rounded-lg border p-4 text-sm ${
          isProduction ? 'border-red-300 bg-red-50 text-red-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'
        }`}
      >
        Aktivt miljø: <strong>{isProduction ? 'PRODUKSJON' : 'DEMO'}</strong>
        {isProduction && !settings?.writeEnabled && ' – kun lesende (skriving er ikke slått på ennå)'}
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_MESSAGES[error] ?? error}</p>}
      {notice === 'production_read_only' && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Produksjon er nå valgt. Synk er kun lesende inntil du eksplisitt slår på skriving under og
          lagrer på nytt (IN-23).
        </p>
      )}
      {notice && notice !== 'production_read_only' && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{NOTICE_MESSAGES[notice] ?? notice}</p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Innstillinger</h2>
        <form action={savePowerOfficeSettings} className="space-y-4 text-sm">
          <label className="block font-medium">
            Miljø
            <select
              name="environment"
              defaultValue={settings?.environment ?? 'DEMO'}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="DEMO">Demo</option>
              <option value="PRODUCTION">Produksjon</option>
            </select>
          </label>

          <div className="grid grid-cols-3 gap-4">
            <label className="block font-medium">
              Applikasjonsnøkkel
              <input
                type="password"
                name="applicationKey"
                autoComplete="off"
                placeholder={settings?.encryptedApplicationKey ? 'Satt – la stå tomt for å beholde' : 'Ikke satt'}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block font-medium">
              Klientnøkkel
              <input
                type="password"
                name="clientKey"
                autoComplete="off"
                placeholder={settings?.encryptedClientKey ? 'Satt – la stå tomt for å beholde' : 'Ikke satt'}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block font-medium">
              Abonnementsnøkkel
              <input
                type="password"
                name="subscriptionKey"
                autoComplete="off"
                placeholder={settings?.encryptedSubscriptionKey ? 'Satt – la stå tomt for å beholde' : 'Ikke satt'}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <details className="rounded border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Avanserte innstillinger (URL-er)</summary>
            <p className="mb-3 mt-2 text-xs text-slate-500">
              Tomt felt bruker innebygd standard for valgt miljø. Fyll kun ut hvis PowerOffice sine
              URL-er avviker fra det som er bygget inn.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block font-medium">
                API-basis-URL
                <input
                  name="apiBaseUrlOverride"
                  defaultValue={settings?.apiBaseUrlOverride ?? ''}
                  placeholder="(standard for miljøet)"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block font-medium">
                Token-URL
                <input
                  name="tokenUrlOverride"
                  defaultValue={settings?.tokenUrlOverride ?? ''}
                  placeholder="(standard for miljøet)"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
          </details>

          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="writeEnabled" defaultChecked={settings?.writeEnabled ?? false} />
            Tillat skriving til PowerOffice (opprette/endre kunder, leverandører og ordre)
          </label>

          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
            Lagre
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 font-medium">Hent inn kunder/leverandører (IN-01)</h2>
        <p className="mb-4 text-sm text-slate-600">
          CRM starter tomt – ingenting hentes inn automatisk. Du velger selv å hente inn alle, ett
          bestemt organisasjonsnummer, eller ingenting.
        </p>

        <form action={importAllFromPowerOfficeAction} className="mb-6">
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Hent alle kunder og leverandører fra PowerOffice
          </button>
        </form>

        <form action={lookupOrgNrAction} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="block font-medium">
            Type
            <select name="entityType" defaultValue="Customer" className="mt-1 rounded border border-slate-300 px-3 py-2">
              <option value="Customer">Kunde</option>
              <option value="Supplier">Leverandør</option>
            </select>
          </label>
          <label className="block font-medium">
            Organisasjonsnummer
            <input name="orgNr" required className="mt-1 rounded border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50">
            Hent inn
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Synkroniseringslogg (IN-21)</h2>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen synkroniseringer registrert ennå.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Tidspunkt</th>
                <th className="py-2">Retning</th>
                <th className="py-2">Status</th>
                <th className="py-2">Melding</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="py-2 text-xs text-slate-500">{formatDate(log.createdAt)}</td>
                  <td className="py-2">{log.direction === 'in' ? 'Inn' : 'Ut'}</td>
                  <td className="py-2">
                    <span className={log.status === 'error' ? 'text-red-700' : 'text-emerald-700'}>
                      {log.status === 'error' ? 'Feil' : 'OK'}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-slate-600">{log.message ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
