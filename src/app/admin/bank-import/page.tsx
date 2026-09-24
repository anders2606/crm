import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { matchBankTransactionManually, uploadBankStatement } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing_file: 'Velg en fil (CAMT.053 .xml eller .csv).',
  unknown_format: 'Filtypen gjenkjennes ikke – bruk .xml (CAMT.053) eller .csv.',
  parse_failed: 'Klarte ikke å tolke filen. Sjekk at den følger forventet format.',
  missing_match: 'Velg hvem transaksjonen skal kobles til.',
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(date);
}

export default async function BankImportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  try {
    await requirePermission(PERMISSIONS.BANK_IMPORT_MANAGE);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/admin/bank-import');
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

  const [imports, customers, suppliers] = await Promise.all([
    prisma.bankStatementImport.findMany({
      orderBy: { importedAt: 'desc' },
      take: 20,
      include: { transactions: { orderBy: { bookingDate: 'desc' } } },
    }),
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

  const error = typeof searchParams.error === 'string' ? searchParams.error : null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Bankfilimport (LE-08)</h1>
        <p className="text-sm text-slate-600">
          Reserve når PowerOffice ikke har rukket å bokføre en betaling ennå (kap. 18). Primær kilde
          til betalingsstatus er alltid PowerOffice selv (IN-10–12) – denne importen skriver aldri
          tilbake til PowerOffice, den gir kun en raskere lokal indikasjon i mellomtiden.
        </p>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_MESSAGES[error] ?? error}</p>}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 font-medium">Last opp kontoutskrift</h2>
        <p className="mb-4 text-sm text-slate-600">
          CAMT.053 (.xml) eller CSV (.csv) med kolonnene dato, beløp, og valgfritt valuta/kid/melding/
          motpart.
        </p>
        <form action={uploadBankStatement} className="flex items-center gap-3 text-sm">
          <input type="file" name="file" accept=".xml,.csv" required className="block text-sm" />
          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Last opp
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-medium">Tidligere importer</h2>
        {imports.length === 0 ? (
          <p className="text-sm text-slate-600">Ingen kontoutskrifter lastet opp ennå.</p>
        ) : (
          <ul className="space-y-6">
            {imports.map((statementImport) => (
              <li key={statementImport.id}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{statementImport.fileName}</span>
                  <span className="text-slate-500">
                    {formatDate(statementImport.importedAt)} · {statementImport.format} ·{' '}
                    {statementImport.transactions.length} transaksjon(er)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1">Dato</th>
                      <th className="py-1">Beløp</th>
                      <th className="py-1">Melding</th>
                      <th className="py-1">Koblet til</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementImport.transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-100 align-top">
                        <td className="py-2">{formatDate(tx.bookingDate)}</td>
                        <td className="py-2">{formatMoney(tx.amountMinor, tx.currency)}</td>
                        <td className="py-2 text-slate-600">
                          {tx.reference ?? '–'}
                          {tx.kid ? ` (KID ${tx.kid})` : ''}
                        </td>
                        <td className="py-2">
                          {tx.matchedEntityType && tx.matchedEntityId ? (
                            <span className="text-emerald-700">
                              {tx.matchedEntityType === 'Customer'
                                ? (customerNameById.get(tx.matchedEntityId) ?? 'Ukjent kunde')
                                : (supplierNameById.get(tx.matchedEntityId) ?? 'Ukjent leverandør')}
                              {tx.matchedInvoiceNo ? ` (faktura ${tx.matchedInvoiceNo})` : ''}
                            </span>
                          ) : (
                            <details>
                              <summary className="cursor-pointer text-amber-700">Ikke koblet – match manuelt</summary>
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <form action={matchBankTransactionManually} className="flex items-center gap-1">
                                  <input type="hidden" name="transactionId" value={tx.id} />
                                  <input type="hidden" name="entityType" value="Customer" />
                                  <select name="entityId" className="rounded border border-slate-300 px-2 py-1 text-xs">
                                    {customers.map((customer) => (
                                      <option key={customer.id} value={customer.id}>
                                        {customer.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                                    Kunde
                                  </button>
                                </form>
                                <form action={matchBankTransactionManually} className="flex items-center gap-1">
                                  <input type="hidden" name="transactionId" value={tx.id} />
                                  <input type="hidden" name="entityType" value="Supplier" />
                                  <select name="entityId" className="rounded border border-slate-300 px-2 py-1 text-xs">
                                    {suppliers.map((supplier) => (
                                      <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                                    Leverandør
                                  </button>
                                </form>
                              </div>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
