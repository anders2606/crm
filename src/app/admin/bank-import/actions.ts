'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { BankStatementFormat } from '@prisma/client';

import { logAudit } from '@/lib/audit/log';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { importBankStatement, setManualBankTransactionMatch } from '@/modules/bank-import/service';

function detectFormat(fileName: string): BankStatementFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xml')) {
    return 'CAMT053';
  }
  if (lower.endsWith('.csv')) {
    return 'CSV';
  }
  return null;
}

// LE-08: laster opp en kontoutskrift (CAMT.053/CSV) og forsøker automatisk
// matching mot åpne kunde-/leverandørfakturaer. Ren lokal fil-/DB-operasjon,
// ingen ekstern systemtrafikk (arbeidsregel 12 gjelder PowerOffice/bank-API-er,
// ikke en administrators egen filopplasting).
export async function uploadBankStatement(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.BANK_IMPORT_MANAGE);
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    redirect('/admin/bank-import?error=missing_file');
  }

  const format = detectFormat(file.name);
  if (!format) {
    redirect('/admin/bank-import?error=unknown_format');
  }

  const content = await file.text();

  let result;
  try {
    result = await importBankStatement({
      fileName: file.name,
      format,
      content,
      importedById: session.id,
    });
  } catch {
    redirect('/admin/bank-import?error=parse_failed');
  }

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'BankStatementImport',
    entityId: result.importId,
    after: { fileName: file.name, transactionCount: result.transactionCount, matchedCount: result.matchedCount },
  });

  revalidatePath('/admin/bank-import');
}

export async function matchBankTransactionManually(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.BANK_IMPORT_MANAGE);
  const transactionId = String(formData.get('transactionId') ?? '');
  const entityType = formData.get('entityType') === 'Supplier' ? 'Supplier' : 'Customer';
  const entityId = String(formData.get('entityId') ?? '');

  if (!transactionId || !entityId) {
    redirect('/admin/bank-import?error=missing_match');
  }

  await setManualBankTransactionMatch({ transactionId, entityType, entityId });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'BankTransaction',
    entityId: transactionId,
    after: { matchedEntityType: entityType, matchedEntityId: entityId, manual: true },
  });

  revalidatePath('/admin/bank-import');
}
