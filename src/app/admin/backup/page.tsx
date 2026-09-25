import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listBackups } from '@/lib/backup';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { restoreBackupAction } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  confirmation_mismatch: 'Du må skrive GJENOPPRETT (med store bokstaver) for å bekrefte.',
  restore_failed: 'Gjenoppretting feilet',
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function BackupPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.BACKUP_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/backup');
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
  const detail = typeof searchParams.detail === 'string' ? searchParams.detail : null;
  const success = typeof searchParams.success === 'string' ? searchParams.success : null;
  const backups = listBackups();

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Backup og gjenoppretting</h1>
        <p className="text-sm text-slate-600">
          Databasen og dokumentene sikkerhetskopieres automatisk hver dag og ved hver oppstart (DR-06), og
          oppbevares i 30 dager.
        </p>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {ERROR_MESSAGES[error] ?? error}
          {detail ? `: ${detail}` : ''}
        </p>
      )}
      {success === 'restored' && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          Gjenoppretting fullført. Alle brukere (inkludert deg) må logge inn på nytt.
        </p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Tilgjengelige backuper</h2>
        {backups.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen backuper funnet ennå.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {backups.map((backup) => (
              <li key={backup.dbFileName} className="rounded border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatDate(backup.createdAt)}</span>
                  <span className="text-xs text-slate-500">
                    Database: {formatSize(backup.dbSizeBytes)}
                    {backup.hasFiles && backup.filesSizeBytes !== null
                      ? ` · Dokumenter: ${formatSize(backup.filesSizeBytes)}`
                      : ' · ingen dokumentbackup for denne'}
                  </span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-red-600 underline">Gjenopprett fra denne</summary>
                  <form action={restoreBackupAction} className="mt-2 space-y-2 rounded bg-red-50 p-3">
                    <input type="hidden" name="dbFileName" value={backup.dbFileName} />
                    <p className="text-xs text-red-800">
                      Dette overskriver ALL nåværende data (kunder, tilbud, ordre, dokumenter mv.) med
                      innholdet i denne backupen, og logger ut alle brukere. Kan ikke angres.
                    </p>
                    <label className="block text-xs font-medium text-red-800">
                      Skriv GJENOPPRETT for å bekrefte
                      <input
                        name="confirmation"
                        required
                        className="mt-1 w-full rounded border border-red-300 px-2 py-1"
                      />
                    </label>
                    <button type="submit" className="rounded bg-red-700 px-3 py-1.5 text-white hover:bg-red-800">
                      Gjenopprett
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
