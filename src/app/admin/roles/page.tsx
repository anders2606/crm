import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import {
  AuthenticationRequiredError,
  PermissionDeniedError,
  PERMISSIONS,
  requirePermission,
} from '@/lib/rbac/permissions';

import { createRole, updateRolePermissions } from './actions';

export default async function AdminRolesPage() {
  try {
    await requirePermission(PERMISSIONS.ADMIN_ROLES_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/roles');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å administrere roller.
          </p>
        </main>
      );
    }
    throw error;
  }

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.permission.findMany({ orderBy: { key: 'asc' } }),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <h1 className="text-xl font-semibold">Roller og rettigheter</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Ny rolle</h2>
        <form action={createRole} className="space-y-4" data-testid="create-role-form">
          <label className="block text-sm font-medium">
            Navn
            <input
              name="name"
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Beskrivelse
            <input
              name="description"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Rettigheter</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {permissions.map((permission) => (
                <label key={permission.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="permissionIds" value={permission.id} />
                  {permission.key}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
          >
            Opprett rolle
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">Eksisterende roller</h2>
        {roles.map((role) => {
          const activeIds = new Set(role.permissions.map((rolePermission) => rolePermission.permissionId));
          return (
            <form
              key={role.id}
              action={updateRolePermissions}
              className="rounded-lg border border-slate-200 bg-white p-6"
            >
              <input type="hidden" name="roleId" value={role.id} />
              <h3 className="font-medium">{role.name}</h3>
              {role.description && <p className="text-sm text-slate-600">{role.description}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {permissions.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="permissionIds"
                      value={permission.id}
                      defaultChecked={activeIds.has(permission.id)}
                    />
                    {permission.key}
                  </label>
                ))}
              </div>
              <button
                type="submit"
                className="mt-4 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Lagre rettigheter
              </button>
            </form>
          );
        })}
      </section>
    </main>
  );
}
