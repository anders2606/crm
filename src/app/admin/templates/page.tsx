import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { TEMPLATE_STATUS_LABELS, TEMPLATE_TYPE_LABELS } from '@/modules/templates/service';

export default async function TemplatesPage() {
  try {
    await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/templates');
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å administrere maler.
          </p>
        </main>
      );
    }
    throw error;
  }

  const templates = await prisma.template.findMany({
    where: { isCurrent: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    include: { customerGroup: true },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-slate-600 underline">
        ← Dashbord
      </Link>
      <div className="mb-6 mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Maler</h1>
          <p className="text-sm text-slate-600">
            Tilbud, ordrebekreftelser, e-poster, oppfølging og nyhetsbrev (SD-01/SD-02).
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/text-blocks" className="underline">
            Tekstblokker
          </Link>
          <Link href="/admin/followup-rules" className="underline">
            Oppfølgingsregler
          </Link>
          <Link href="/admin/templates/new" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
            Ny mal
          </Link>
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen maler opprettet ennå.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/admin/templates/${template.groupId}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm hover:border-slate-400"
              >
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-slate-600">
                    {TEMPLATE_TYPE_LABELS[template.type]} · {template.language}
                    {template.customerGroup ? ` · ${template.customerGroup.name}` : ' · alle kundegrupper'}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{TEMPLATE_STATUS_LABELS[template.status]}</p>
                  <p>v{template.version}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
