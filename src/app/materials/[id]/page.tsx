import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DocumentUploadForm } from '@/components/document-upload-form';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { listDocumentGroupsForEntity } from '@/modules/documents/service';
import {
  buildPriceChartPath,
  MATERIAL_AVAILABILITY_LABELS,
  MATERIAL_FINISH_LABELS,
  MATERIAL_TYPE_LABELS,
  PRICE_ENTRY_TYPE_LABELS,
} from '@/modules/materials/service';

import { addMaterialSupplier, addPriceEntry, updateMaterial, uploadMaterialPhoto } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Beløp og dato er påkrevd.',
  missing_rate: 'Fant ingen valutakurs for den datoen ennå. Prøv igjen om litt, eller registrer i NOK.',
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(date);
}

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.MATERIAL_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?next=/materials/${params.id}`);
    }
    if (error instanceof PermissionDeniedError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-lg font-semibold">Ingen tilgang</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du har ikke rettigheten som kreves for å se materialbiblioteket.
          </p>
        </main>
      );
    }
    throw error;
  }

  const material = await prisma.material.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      suppliers: { include: { supplier: true } },
      priceEntries: { orderBy: { priceDate: 'desc' }, include: { supplier: true } },
    },
  });

  if (!material) {
    notFound();
  }

  const [allSuppliers, photoGroups] = await Promise.all([
    prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listDocumentGroupsForEntity('Material', material.id),
  ]);

  const linkedSupplierIds = new Set(material.suppliers.map((entry) => entry.supplierId));
  const errorMessage = typeof searchParams.error === 'string' ? ERROR_MESSAGES[searchParams.error] : undefined;

  const salePoints = material.priceEntries
    .filter((entry) => entry.type === 'SALE')
    .map((entry) => ({ date: entry.priceDate, amountNokMinor: entry.amountNokMinor }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const chartPath = buildPriceChartPath(salePoints);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/materials" className="text-sm text-slate-600 underline">
          ← Materialbibliotek
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{material.name}</h1>
        <p className="text-sm text-slate-600">
          {MATERIAL_TYPE_LABELS[material.type]} – {MATERIAL_AVAILABILITY_LABELS[material.availability]}
        </p>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Stamdata</h2>
        <form action={updateMaterial} className="space-y-4 text-sm">
          <input type="hidden" name="materialId" value={material.id} />
          <label className="block font-medium">
            Navn
            <input name="name" defaultValue={material.name} required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block font-medium">
            Handelsnavn
            <input name="tradeName" defaultValue={material.tradeName ?? ''} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block font-medium">
              Type
              <select name="type" defaultValue={material.type} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                {Object.entries(MATERIAL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-medium">
              Overflatebehandling
              <select name="finish" defaultValue={material.finish ?? ''} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                <option value="">– ikke satt –</option>
                {Object.entries(MATERIAL_FINISH_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block font-medium">
              Opprinnelsesland/brudd
              <input name="origin" defaultValue={material.origin ?? ''} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="block font-medium">
              Farge
              <input name="color" defaultValue={material.color ?? ''} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block font-medium">
              Tykkelser (mm, kommaseparert)
              <input
                name="thicknessesMm"
                defaultValue={material.thicknessesMm.join(', ')}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block font-medium">
              Platestørrelser (kommaseparert)
              <input
                name="slabSizes"
                defaultValue={material.slabSizes.join(', ')}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="block font-medium">
            Tilgjengelighet
            <select name="availability" defaultValue={material.availability} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              {Object.entries(MATERIAL_AVAILABILITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-medium">
            Vedlikeholdsråd
            <textarea
              name="maintenanceNotes"
              rows={3}
              defaultValue={material.maintenanceNotes ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
            Lagre
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Leverandører</h2>
        {material.suppliers.length > 0 ? (
          <ul className="mb-4 space-y-1 text-sm">
            {material.suppliers.map((entry) => (
              <li key={entry.supplierId}>
                <Link href={`/suppliers/${entry.supplierId}`} className="underline">
                  {entry.supplier.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen leverandører koblet ennå.</p>
        )}
        <form action={addMaterialSupplier} className="flex gap-3 text-sm">
          <input type="hidden" name="materialId" value={material.id} />
          <select name="supplierId" required className="rounded border border-slate-300 px-3 py-2">
            <option value="">Velg leverandør …</option>
            {allSuppliers
              .filter((supplier) => !linkedSupplierIds.has(supplier.id))
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </select>
          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Koble til
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Bilder</h2>
        {photoGroups.length > 0 ? (
          <div className="mb-4 grid grid-cols-3 gap-3">
            {photoGroups.map((group) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={group.groupId}
                src={`/api/documents/${group.current.id}/file`}
                alt={group.current.fileName}
                className="aspect-square rounded border border-slate-200 object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-slate-600">Ingen bilder lastet opp ennå.</p>
        )}
        <DocumentUploadForm action={uploadMaterialPhoto} hiddenFields={{ materialId: material.id }} showCategory={false} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Prishistorikk</h2>

        {salePoints.length > 1 && (
          <svg viewBox="0 0 480 160" className="mb-4 w-full rounded border border-slate-100 bg-slate-50">
            <path d={chartPath} fill="none" stroke="#0f172a" strokeWidth={2} />
          </svg>
        )}

        {material.priceEntries.length > 0 ? (
          <table className="mb-6 w-full text-sm">
            <thead className="border-b border-slate-200 text-left">
              <tr>
                <th className="py-1 pr-3 font-medium">Dato</th>
                <th className="py-1 pr-3 font-medium">Type</th>
                <th className="py-1 pr-3 font-medium">Beløp</th>
                <th className="py-1 pr-3 font-medium">NOK</th>
                <th className="py-1 pr-3 font-medium">Enhet</th>
                <th className="py-1 font-medium">Leverandør</th>
              </tr>
            </thead>
            <tbody>
              {material.priceEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-3">{formatDate(entry.priceDate)}</td>
                  <td className="py-1 pr-3">{PRICE_ENTRY_TYPE_LABELS[entry.type]}</td>
                  <td className="py-1 pr-3">{formatMoney(entry.amountMinor, entry.currency)}</td>
                  <td className="py-1 pr-3">{formatMoney(entry.amountNokMinor, 'NOK')}</td>
                  <td className="py-1 pr-3">{entry.unit}</td>
                  <td className="py-1">{entry.supplier?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mb-6 text-sm text-slate-600">Ingen priser registrert ennå.</p>
        )}

        <form action={addPriceEntry} className="grid grid-cols-3 gap-3 text-sm">
          <input type="hidden" name="materialId" value={material.id} />
          <select name="type" defaultValue="PURCHASE" className="rounded border border-slate-300 px-2 py-1.5">
            <option value="PURCHASE">Innkjøp</option>
            <option value="SALE">Salg</option>
          </select>
          <select name="supplierId" className="rounded border border-slate-300 px-2 py-1.5">
            <option value="">Leverandør (kun innkjøp)</option>
            {material.suppliers.map((entry) => (
              <option key={entry.supplierId} value={entry.supplierId}>
                {entry.supplier.name}
              </option>
            ))}
          </select>
          <input type="date" name="priceDate" required className="rounded border border-slate-300 px-2 py-1.5" />
          <input name="amount" placeholder="Beløp, f.eks. 850,00" required className="rounded border border-slate-300 px-2 py-1.5" />
          <input name="currency" defaultValue="NOK" placeholder="Valuta" className="rounded border border-slate-300 px-2 py-1.5" />
          <input name="unit" defaultValue="m²" placeholder="Enhet" className="rounded border border-slate-300 px-2 py-1.5" />
          <input name="source" placeholder="Kilde (valgfritt)" className="col-span-2 rounded border border-slate-300 px-2 py-1.5" />
          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Registrer pris
          </button>
        </form>
      </section>
    </main>
  );
}
