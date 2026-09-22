import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

export default async function TextBlocksPage() {
  try {
    await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/text-blocks');
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

  const textBlocks = await prisma.textBlock.findMany({
    where: { isCurrent: true },
    orderBy: { name: 'asc' },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/admin/templates" className="text-sm text-slate-600 underline">
        ← Maler
      </Link>
      <div className="mb-6 mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tekstblokker</h1>
          <p className="text-sm text-slate-600">
            F.eks. vedlikeholdsråd for marmor, montering, måltaking, naturlig variasjon (TO-03).
          </p>
        </div>
        <Link href="/admin/text-blocks/new" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          Ny tekstblokk
        </Link>
      </div>

      {textBlocks.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen tekstblokker opprettet ennå.</p>
      ) : (
        <ul className="space-y-2">
          {textBlocks.map((block) => (
            <li key={block.id}>
              <Link
                href={`/admin/text-blocks/${block.groupId}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm hover:border-slate-400"
              >
                <span className="font-medium">{block.name}</span>
                <span className="text-xs text-slate-500">
                  {block.language} · v{block.version}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
