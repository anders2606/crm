import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import {
  quoteConversionSummary,
  salesByCustomer,
  salesByCustomerGroup,
  salesByMaterial,
} from '@/modules/reports/service';

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function csvLink(type: string, from: string | undefined, to: string | undefined): string {
  const params = new URLSearchParams({ type });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return `/api/reports/csv?${params.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.REPORTS_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/reports');
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

  const fromInput = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const toInput = typeof searchParams.to === 'string' ? searchParams.to : undefined;
  const range = { from: parseDate(fromInput), to: parseDate(toInput) };

  const [byCustomer, byGroup, byMaterial, conversion] = await Promise.all([
    salesByCustomer(range),
    salesByCustomerGroup(range),
    salesByMaterial(range),
    quoteConversionSummary(range),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Rapporter</h1>
        <p className="text-sm text-slate-600">Salg og tilbudskonvertering (GE-10). Kansellerte ordre telles ikke.</p>
      </div>

      <form className="flex items-end gap-3 text-sm" method="get">
        <label className="block">
          Fra dato
          <input type="date" name="from" defaultValue={fromInput ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          Til dato
          <input type="date" name="to" defaultValue={toInput ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2" />
        </label>
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-50">
          Filtrer
        </button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Tilbudskonvertering</h2>
          <a href={csvLink('quote-conversion', fromInput, toInput)} className="text-sm underline">
            Last ned CSV
          </a>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded border border-slate-100 p-3">
            <p className="text-lg font-semibold">{conversion.totalSentQuotes}</p>
            <p className="text-slate-600">Sendte tilbud</p>
          </div>
          <div className="rounded border border-slate-100 p-3">
            <p className="text-lg font-semibold">{conversion.convertedQuotes}</p>
            <p className="text-slate-600">Konvertert til ordre</p>
          </div>
          <div className="rounded border border-slate-100 p-3">
            <p className="text-lg font-semibold">{conversion.conversionRatePercent}%</p>
            <p className="text-slate-600">Konverteringsgrad</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Salg per kunde</h2>
          <a href={csvLink('customer', fromInput, toInput)} className="text-sm underline">
            Last ned CSV
          </a>
        </div>
        {byCustomer.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen ordre i perioden.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Kunde</th>
                <th className="py-2">Antall ordre</th>
                <th className="py-2">Sum</th>
              </tr>
            </thead>
            <tbody>
              {byCustomer.map((row) => (
                <tr key={`${row.customerId}-${row.currency}`} className="border-b border-slate-100">
                  <td className="py-2">{row.customerName}</td>
                  <td className="py-2">{row.orderCount}</td>
                  <td className="py-2">{formatMoney(row.totalMinor, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Salg per kundegruppe</h2>
          <a href={csvLink('customer-group', fromInput, toInput)} className="text-sm underline">
            Last ned CSV
          </a>
        </div>
        {byGroup.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen ordre i perioden.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Kundegruppe</th>
                <th className="py-2">Antall ordre</th>
                <th className="py-2">Sum</th>
              </tr>
            </thead>
            <tbody>
              {byGroup.map((row) => (
                <tr key={`${row.groupId ?? 'none'}-${row.currency}`} className="border-b border-slate-100">
                  <td className="py-2">{row.groupName}</td>
                  <td className="py-2">{row.orderCount}</td>
                  <td className="py-2">{formatMoney(row.totalMinor, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Salg per materiale</h2>
          <a href={csvLink('material', fromInput, toInput)} className="text-sm underline">
            Last ned CSV
          </a>
        </div>
        {byMaterial.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen ordre med materialkoblede linjer i perioden.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Materiale</th>
                <th className="py-2">Antall</th>
                <th className="py-2">Sum</th>
              </tr>
            </thead>
            <tbody>
              {byMaterial.map((row) => (
                <tr key={`${row.materialId}-${row.currency}`} className="border-b border-slate-100">
                  <td className="py-2">{row.materialName}</td>
                  <td className="py-2">
                    {(row.quantityMilli / 1000).toLocaleString('nb-NO')} {row.unit}
                  </td>
                  <td className="py-2">{formatMoney(row.totalMinor, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
