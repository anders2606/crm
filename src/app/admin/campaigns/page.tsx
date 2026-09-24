import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { EMAIL_CAMPAIGN_STATUS_LABELS } from '@/modules/campaigns/service';

export default async function CampaignsPage() {
  try {
    await requirePermission(PERMISSIONS.CAMPAIGN_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/campaigns');
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

  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { recipients: true } } },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-slate-600 underline">
        ← Dashbord
      </Link>
      <div className="mb-6 mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Gruppeutsendelser</h1>
          <p className="text-sm text-slate-600">Nyhetsbrev og kampanjer til kundegrupper (GR-01–07).</p>
        </div>
        <Link href="/admin/campaigns/new" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          Ny kampanje
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen kampanjer opprettet ennå.</p>
      ) : (
        <ul className="space-y-2">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={`/admin/campaigns/${campaign.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm hover:border-slate-400"
              >
                <div>
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-slate-600">{campaign._count.recipients} mottaker(e)</p>
                </div>
                <span className="text-xs text-slate-500">{EMAIL_CAMPAIGN_STATUS_LABELS[campaign.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
