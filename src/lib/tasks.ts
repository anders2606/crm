// GE-07: oppgaver og påminnelser per bruker.
import { prisma } from '@/lib/db';

/** Åpne oppgaver for en bruker, forfalte og dagens først. */
export async function listOpenTasksForUser(userId: string) {
  return prisma.task.findMany({
    where: { assigneeId: userId, status: 'OPEN' },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
  });
}
