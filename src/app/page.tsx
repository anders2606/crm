import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { hasPermission, PERMISSIONS } from '@/lib/rbac/permissions';

import { logoutAction } from './login/actions';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pietra Unica CRM</h1>
          <p className="text-sm text-slate-600">
            Innlogget som {session.name} ({session.roles.join(', ') || 'ingen rolle'})
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-slate-600 underline hover:text-slate-900">
            Logg ut
          </button>
        </form>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 font-medium">Dagens oversikt</h2>
        <p className="text-sm text-slate-600">
          Oppgaver, åpne tilbud og forfalte oppfølginger vises her fra og med milepæl M5/M7
          (GE-07). Fundamentet (M0) inneholder foreløpig innlogging, roller og revisjonslogg.
        </p>
      </section>

      {hasPermission(session, PERMISSIONS.ADMIN_ROLES_MANAGE) && (
        <section className="mt-6">
          <Link href="/admin/roles" className="text-sm font-medium text-slate-900 underline">
            Administrer roller og rettigheter →
          </Link>
        </section>
      )}
    </main>
  );
}
