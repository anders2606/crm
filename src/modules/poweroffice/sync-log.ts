// IN-21: logg over synkroniseringer og tydelig varsel ved feil.
import { prisma } from '@/lib/db';

export interface RecordSyncLogInput {
  direction: 'in' | 'out';
  status: 'success' | 'error';
  entityType?: string;
  entityId?: string;
  message?: string;
}

export async function recordSyncLog(input: RecordSyncLogInput): Promise<void> {
  await prisma.syncLog.create({
    data: {
      integration: 'poweroffice',
      direction: input.direction,
      status: input.status,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      message: input.message ?? null,
    },
  });
}
