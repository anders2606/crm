// M2 Dokumenter: felles opplastings-/versjonerings-/listelogikk delt mellom
// kunde- og leverandørkortet (og senere prosjekt/tilbud/ordre/materiale).
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Document, DocumentCategory } from '@prisma/client';

import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { PERMISSIONS, type PermissionKey } from '@/lib/rbac/permissions';
import { getStorage } from '@/lib/storage';

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  DRAWING: 'Tegning',
  PHOTO: 'Bilde',
  QUOTE_SENT: 'Tilbud sendt',
  QUOTE_RECEIVED: 'Tilbud mottatt',
  ORDER_CONFIRMATION: 'Ordrebekreftelse',
  INVOICE: 'Faktura',
  CONTRACT: 'Kontrakt',
  OTHER: 'Annet',
};

export function getReadPermissionForEntityType(entityType: string): PermissionKey {
  return entityType === ENTITY_TYPES.SUPPLIER ? PERMISSIONS.SUPPLIER_READ : PERMISSIONS.CUSTOMER_READ;
}

export function getWritePermissionForEntityType(entityType: string): PermissionKey {
  return entityType === ENTITY_TYPES.SUPPLIER ? PERMISSIONS.SUPPLIER_WRITE : PERMISSIONS.CUSTOMER_WRITE;
}

/** DO-03: PDF-er og bilder kan forhåndsvises inline; andre filtyper (DWG, Office …) må åpnes/lastes ned. */
export function isPreviewableInBrowser(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export interface SaveDocumentUploadInput {
  entityType: string;
  entityId: string;
  category: DocumentCategory;
  file: File;
  /** Sett når opplastingen er en ny versjon av et eksisterende dokument (DO-04). */
  replacesDocumentId?: string | null;
  userId: string | null;
}

export async function saveDocumentUpload(input: SaveDocumentUploadInput): Promise<Document> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const storageKey = `${input.entityType}/${input.entityId}/${randomUUID()}${path.extname(input.file.name)}`;
  await getStorage().put(storageKey, buffer);

  const mimeType = input.file.type || 'application/octet-stream';
  const sizeBytes = buffer.byteLength;

  if (input.replacesDocumentId) {
    const previous = await prisma.document.findUniqueOrThrow({
      where: { id: input.replacesDocumentId },
    });

    const [, created] = await prisma.$transaction([
      prisma.document.update({ where: { id: previous.id }, data: { isCurrent: false } }),
      prisma.document.create({
        data: {
          groupId: previous.groupId,
          version: previous.version + 1,
          isCurrent: true,
          fileName: input.file.name,
          mimeType,
          sizeBytes,
          category: previous.category,
          storageKey,
          entityType: input.entityType,
          entityId: input.entityId,
          createdById: input.userId,
        },
      }),
    ]);

    return created;
  }

  const id = randomUUID();
  return prisma.document.create({
    data: {
      id,
      groupId: id,
      version: 1,
      isCurrent: true,
      fileName: input.file.name,
      mimeType,
      sizeBytes,
      category: input.category,
      storageKey,
      entityType: input.entityType,
      entityId: input.entityId,
      createdById: input.userId,
    },
  });
}

export interface DocumentGroup {
  groupId: string;
  current: Document;
  previousVersions: Document[];
}

/** Grupperer dokumenter etter versjonskjede. Nyeste gjeldende dokument først. */
export async function listDocumentGroupsForEntity(
  entityType: string,
  entityId: string,
): Promise<DocumentGroup[]> {
  const documents = await prisma.document.findMany({
    where: { entityType, entityId, deletedAt: null },
    orderBy: [{ groupId: 'asc' }, { version: 'desc' }],
  });

  const byGroup = new Map<string, Document[]>();
  for (const document of documents) {
    const list = byGroup.get(document.groupId) ?? [];
    list.push(document);
    byGroup.set(document.groupId, list);
  }

  const groups: DocumentGroup[] = [];
  for (const [groupId, docs] of byGroup) {
    const current = docs.find((document) => document.isCurrent) ?? docs[0]!;
    groups.push({
      groupId,
      current,
      previousVersions: docs.filter((document) => document.id !== current.id),
    });
  }

  groups.sort((a, b) => b.current.createdAt.getTime() - a.current.createdAt.getTime());
  return groups;
}
