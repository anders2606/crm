'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { logAudit } from '@/lib/audit/log';
import { restoreBackup } from '@/lib/backup';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

const CONFIRMATION_PHRASE = 'GJENOPPRETT';

export async function restoreBackupAction(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.BACKUP_MANAGE);
  const dbFileName = String(formData.get('dbFileName') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');

  if (confirmation !== CONFIRMATION_PHRASE) {
    redirect(`/admin/backup?error=confirmation_mismatch`);
  }

  try {
    await restoreBackup(dbFileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/admin/backup?error=restore_failed&detail=${encodeURIComponent(message)}`);
  }

  await logAudit({
    userId: session.id,
    action: 'restore',
    entityType: 'Backup',
    entityId: dbFileName,
  });

  revalidatePath('/admin/backup');
  redirect('/admin/backup?success=restored');
}
