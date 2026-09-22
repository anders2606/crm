// LE-08: lagrer en opplastet kontoutskrift og forsøker å automatisk matche
// hver transaksjon. Kalles fra en server action (ikke workeren) – dette
// leser og skriver kun i vår egen database, det er ingen ekstern
// systemtrafikk her (arbeidsregel 12 gjelder eksterne API-kall, ikke
// filopplasting fra en administrator).
import type { BankStatementFormat } from '@prisma/client';

import { prisma } from '@/lib/db';

import { matchBankTransaction } from './match';
import { parseCamt053 } from './parse-camt053';
import { parseBankCsv } from './parse-csv';

export interface ImportBankStatementInput {
  fileName: string;
  format: BankStatementFormat;
  content: string;
  importedById: string | null;
}

export interface ImportBankStatementResult {
  importId: string;
  transactionCount: number;
  matchedCount: number;
}

export async function importBankStatement(input: ImportBankStatementInput): Promise<ImportBankStatementResult> {
  const parsed = input.format === 'CAMT053' ? parseCamt053(input.content) : parseBankCsv(input.content);

  const statementImport = await prisma.bankStatementImport.create({
    data: {
      fileName: input.fileName,
      format: input.format,
      importedById: input.importedById,
    },
  });

  let matchedCount = 0;

  for (const tx of parsed) {
    const match = await matchBankTransaction(tx);
    if (match) {
      matchedCount += 1;
    }

    await prisma.bankTransaction.create({
      data: {
        importId: statementImport.id,
        bookingDate: tx.bookingDate,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        kid: tx.kid,
        reference: tx.reference,
        counterpartyName: tx.counterpartyName,
        matchedEntityType: match?.entityType ?? null,
        matchedEntityId: match?.entityId ?? null,
        matchedInvoiceNo: match?.invoiceNo ?? null,
        matchedAt: match ? new Date() : null,
      },
    });
  }

  return { importId: statementImport.id, transactionCount: parsed.length, matchedCount };
}

export interface SetManualMatchInput {
  transactionId: string;
  entityType: 'Customer' | 'Supplier';
  entityId: string;
}

/** Administrator kobler en ikke-automatisk-matchet transaksjon manuelt. */
export async function setManualBankTransactionMatch(input: SetManualMatchInput): Promise<void> {
  await prisma.bankTransaction.update({
    where: { id: input.transactionId },
    data: {
      matchedEntityType: input.entityType,
      matchedEntityId: input.entityId,
      matchedAt: new Date(),
    },
  });
}
