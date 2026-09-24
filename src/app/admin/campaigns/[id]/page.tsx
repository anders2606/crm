import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import {
  EMAIL_CAMPAIGN_RECIPIENT_STATUS_LABELS,
  EMAIL_CAMPAIGN_STATUS_LABELS,
} from '@/modules/campaigns/service';
import { resolveCampaignRecipientCustomerIds } from '@/modules/campaigns/segment';

import { queueCampaignAction } from '../actions';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.CAMPAIGN_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?next=/admin/campaigns/${params.id}`);
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

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: params.id },
    include: {
      template: true,
      emailAccount: true,
      recipients: { include: { customer: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!campaign) {
    notFound();
  }

  const statusCounts = campaign.recipients.reduce<Record<string, number>>((counts, recipient) => {
    counts[recipient.status] = (counts[recipient.status] ?? 0) + 1;
    return counts;
  }, {});

  const estimatedRecipientCount =
    campaign.status === 'DRAFT'
      ? (
          await resolveCampaignRecipientCustomerIds({
            customerGroupIds: campaign.customerGroupIds,
            filterPurchasedWithinDays: campaign.filterPurchasedWithinDays,
            filterCountry: campaign.filterCountry,
            filterMaterialId: campaign.filterMaterialId,
          })
        ).length
      : null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/admin/campaigns" className="text-sm text-slate-600 underline">
          ← Kampanjer
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
            {EMAIL_CAMPAIGN_STATUS_LABELS[campaign.status]}
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Mal: {campaign.template.name} · Sendes fra: {campaign.emailAccount.address}
          {campaign.scheduledAt ? ` · Planlagt: ${formatDate(campaign.scheduledAt)}` : ''}
        </p>
      </div>

      {campaign.status === 'DRAFT' && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-center justify-between gap-4">
            <span>
              Kladd – ca. {estimatedRecipientCount} mottaker(e) med dagens utvalg og samtykke (GR-01/02). Mottakerlisten
              fryses når kampanjen legges i kø.
            </span>
            <form action={queueCampaignAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <button type="submit" className="rounded border border-amber-400 px-3 py-1.5 hover:bg-amber-100">
                {campaign.scheduledAt ? 'Planlegg utsendelse' : 'Legg i sendekø'}
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Statistikk (GR-06)</h2>
        <div className="grid grid-cols-5 gap-3 text-center text-sm">
          {Object.entries(EMAIL_CAMPAIGN_RECIPIENT_STATUS_LABELS).map(([status, label]) => (
            <div key={status} className="rounded border border-slate-100 p-3">
              <p className="text-lg font-semibold">{statusCounts[status] ?? 0}</p>
              <p className="text-slate-600">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Mottakere</h2>
        {campaign.recipients.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen mottakere ennå – legg kampanjen i kø for å løse ut utvalget.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Kunde</th>
                <th className="py-2">Status</th>
                <th className="py-2">Tidspunkt</th>
              </tr>
            </thead>
            <tbody>
              {campaign.recipients.map((recipient) => (
                <tr key={recipient.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link href={`/customers/${recipient.customerId}`} className="underline">
                      {recipient.customer.name}
                    </Link>
                  </td>
                  <td className="py-2">{EMAIL_CAMPAIGN_RECIPIENT_STATUS_LABELS[recipient.status]}</td>
                  <td className="py-2 text-xs text-slate-500">
                    {recipient.sentAt ? formatDate(recipient.sentAt) : recipient.bouncedAt ? formatDate(recipient.bouncedAt) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </main>
  );
}
