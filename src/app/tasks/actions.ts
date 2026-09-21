'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/rbac/permissions';

/** Kun oppgavens ansvarlige kan markere den som fullført (GE-07: per bruker). */
export async function completeOwnTask(formData: FormData): Promise<void> {
  const session = await requireSession();
  const taskId = String(formData.get('taskId') ?? '');

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.assigneeId !== session.id) {
    return;
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: 'DONE' } });
  revalidatePath('/');
}
