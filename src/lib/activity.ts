// KU-06/LE-09: tidslinje per kunde/leverandør. Samme entityType+entityId-
// mønster som AuditLog, slik at flere entiteter (tilbud, ordre, prosjekt …)
// kan kobles på i senere milepæler uten skjemaendring her.
import type { ActivityType } from '@prisma/client';

import { prisma } from '@/lib/db';

export interface RecordActivityInput {
  type: ActivityType;
  text: string;
  entityType: string;
  entityId: string;
  createdById: string | null;
  occurredAt?: Date;
}

export async function recordActivity(input: RecordActivityInput) {
  return prisma.activity.create({
    data: {
      type: input.type,
      text: input.text,
      entityType: input.entityType,
      entityId: input.entityId,
      createdById: input.createdById,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

/** Nyeste aktivitet først (M1-akseptansekriterium: tidslinjen viser nyeste først). */
export async function listActivities(entityType: string, entityId: string) {
  return prisma.activity.findMany({
    where: { entityType, entityId },
    orderBy: { occurredAt: 'desc' },
  });
}
