import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { hasPermission, PERMISSIONS } from '@/lib/rbac/permissions';
import { listOpenTasksForUser } from '@/lib/tasks';

import { logoutAction } from './login/actions';
import { completeOwnTask } from './tasks/actions';

const ENTITY_LINK: Record<string, (id: string) => string> = {
  [ENTITY_TYPES.CUSTOMER]: (id) => `/customers/${id}`,
  [ENTITY_TYPES.SUPPLIER]: (id) => `/suppliers/${id}`,
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const tasks = await listOpenTasksForUser(session.id);
  const now = Date.now();

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

      <form action="/search" method="get" className="mb-4">
        <input
          type="search"
          name="q"
          placeholder="Søk på kunder og leverandører …"
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      <nav className="mb-6 flex gap-4 text-sm">
        {hasPermission(session, PERMISSIONS.CUSTOMER_READ) && (
          <Link href="/customers" className="underline">
            Kunder
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.SUPPLIER_READ) && (
          <Link href="/suppliers" className="underline">
            Leverandører
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.MATERIAL_READ) && (
          <Link href="/materials" className="underline">
            Materialbibliotek
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.QUOTE_READ) && (
          <Link href="/quotes" className="underline">
            Tilbud
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.ORDER_READ) && (
          <Link href="/orders" className="underline">
            Ordre
          </Link>
        )}
        <Link href="/email/unassigned" className="underline">
          Tilordningskø (e-post)
        </Link>
        {hasPermission(session, PERMISSIONS.EMAIL_ACCOUNTS_MANAGE) && (
          <Link href="/email/accounts" className="underline">
            E-postkontoer
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.TEMPLATE_MANAGE) && (
          <Link href="/admin/templates" className="underline">
            Maler
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.POWEROFFICE_MANAGE) && (
          <Link href="/admin/poweroffice" className="underline">
            PowerOffice
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.BANK_IMPORT_MANAGE) && (
          <Link href="/admin/bank-import" className="underline">
            Bankfilimport
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.CAMPAIGN_MANAGE) && (
          <Link href="/admin/campaigns" className="underline">
            Utsendelser
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.REPORTS_READ) && (
          <Link href="/admin/reports" className="underline">
            Rapporter
          </Link>
        )}
        {hasPermission(session, PERMISSIONS.CUSTOM_FIELDS_MANAGE) && (
          <Link href="/admin/custom-fields" className="underline">
            Egendefinerte felt
          </Link>
        )}
        <Link href="/governing-documents" className="underline">
          Planer og styrende dokumenter
        </Link>
        {hasPermission(session, PERMISSIONS.ADMIN_ROLES_MANAGE) && (
          <Link href="/admin/roles" className="underline">
            Roller og rettigheter
          </Link>
        )}
      </nav>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 font-medium">Mine oppgaver</h2>
        <p className="mb-4 text-sm text-slate-600">
          Åpne tilbud og forfalte oppfølginger vises her fra og med milepæl M5/M7 (GE-07).
        </p>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen åpne oppgaver.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {tasks.map((task) => {
              const isOverdue = task.dueAt !== null && task.dueAt.getTime() < now;
              const link =
                task.entityType && task.entityId ? ENTITY_LINK[task.entityType]?.(task.entityId) : undefined;
              return (
                <li
                  key={task.id}
                  className="flex items-center justify-between rounded border border-slate-100 px-3 py-2"
                >
                  <span>
                    {link ? (
                      <Link href={link} className="font-medium underline">
                        {task.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{task.title}</span>
                    )}
                    {task.dueAt && (
                      <span className={isOverdue ? 'ml-2 text-red-600' : 'ml-2 text-slate-500'}>
                        frist {formatDate(task.dueAt)}
                        {isOverdue ? ' (forfalt)' : ''}
                      </span>
                    )}
                  </span>
                  <form action={completeOwnTask}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button type="submit" className="text-xs text-slate-600 underline">
                      Fullfør
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
