// GE-06: alle registreringer og endringer logges med bruker og tidspunkt.
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

export interface AuditEntry {
  userId: string | null;
  action: 'create' | 'update' | 'delete' | 'login' | 'login_failed' | 'logout' | 'restore';
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Skriver en rad til AuditLog. Kall med en `Prisma.TransactionClient` når
 * revisjonsraden skal skrives i samme transaksjon som selve endringen, slik
 * at de aldri kommer ut av synk.
 */
export async function logAudit(
  entry: AuditEntry,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
    },
  });
}
