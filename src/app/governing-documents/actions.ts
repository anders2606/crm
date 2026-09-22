'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { ENTITY_TYPES, GOVERNING_DOCUMENTS_ENTITY_ID } from '@/lib/entity-types';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import { saveDocumentUpload } from '@/modules/documents/service';

// SD-01: eget område for planer og styrende dokumenter. Administrator kan
// laste opp uten hjelp fra utvikler (samme rettighet som malbiblioteket, SD-02).
export async function uploadGoverningDocument(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.TEMPLATE_MANAGE);
  const file = formData.get('file');
  const replacesDocumentId = String(formData.get('replacesDocumentId') ?? '').trim() || undefined;

  if (!(file instanceof File) || file.size === 0) {
    return;
  }

  const document = await saveDocumentUpload({
    entityType: ENTITY_TYPES.GOVERNING_DOCUMENTS,
    entityId: GOVERNING_DOCUMENTS_ENTITY_ID,
    category: 'OTHER',
    file,
    replacesDocumentId,
    userId: session.id,
  });

  await logAudit({
    userId: session.id,
    action: replacesDocumentId ? 'update' : 'create',
    entityType: 'Document',
    entityId: document.id,
    after: { fileName: document.fileName, version: document.version },
  });

  revalidatePath('/governing-documents');
}
