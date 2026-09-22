import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import {
  AuthenticationRequiredError,
  PermissionDeniedError,
  PERMISSIONS,
  requirePermission,
} from '@/lib/rbac/permissions';

import { createEmailAccount, deactivateEmailAccount } from './actions';

export default async function EmailAccountsPage() {
  try {
    await requirePermission(PERMISSIONS.EMAIL_ACCOUNTS_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/email/accounts');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å administrere e-postkontoer.
          </p>
        </main>
      );
    }
    throw error;
  }

  const [accounts, users, roles] = await Promise.all([
    prisma.emailAccount.findMany({
      orderBy: { address: 'asc' },
      include: { owner: { select: { name: true } }, accessRoles: { include: { role: true } } },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">E-postkontoer</h1>
        <p className="text-sm text-slate-600">
          Personlige postbokser og felles postbokser (f.eks. post@/ordre@), med rollestyrt tilgang
          til de felles (EP-03).
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Ny e-postkonto</h2>
        <form action={createEmailAccount} className="space-y-4 text-sm">
          <label className="block font-medium">
            E-postadresse
            <input
              type="email"
              name="address"
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block font-medium">
              Brukernavn (IMAP/SMTP-innlogging)
              <input name="username" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="block font-medium">
              Passord
              <input
                type="password"
                name="password"
                required
                autoComplete="new-password"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block font-medium">
              IMAP-server
              <input name="imapHost" required placeholder="imap.domeneshop.no" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="block font-medium">
              IMAP-port
              <input type="number" name="imapPort" defaultValue={993} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block font-medium">
              SMTP-server
              <input name="smtpHost" required placeholder="smtp.domeneshop.no" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="block font-medium">
              SMTP-port
              <input type="number" name="smtpPort" defaultValue={465} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
          </div>

          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="shared" value="1" />
            Felles postboks (f.eks. post@ eller ordre@)
          </label>

          <label className="block font-medium">
            Eier (kun for personlig postboks)
            <select name="ownerUserId" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              <option value="">– velg bruker –</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="font-medium">Roller med tilgang (kun for felles postboks)</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2">
                  <input type="checkbox" name="roleIds" value={role.id} />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
            Opprett konto
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Eksisterende kontoer</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen e-postkontoer registrert ennå.</p>
        ) : (
          accounts.map((account) => (
            <div key={account.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{account.address}</span>{' '}
                  {!account.active && <span className="text-red-600">(deaktivert)</span>}
                  <p className="text-slate-600">
                    {account.shared
                      ? `Felles – tilgang: ${account.accessRoles.map((entry) => entry.role.name).join(', ') || 'ingen roller'}`
                      : `Personlig – ${account.owner?.name ?? 'ingen eier satt'}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {account.imapHost}:{account.imapPort} / {account.smtpHost}:{account.smtpPort}
                  </p>
                </div>
                {account.active && (
                  <form action={deactivateEmailAccount}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <button type="submit" className="text-xs text-slate-600 underline">
                      Deaktiver
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
