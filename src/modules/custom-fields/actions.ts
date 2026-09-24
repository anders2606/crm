'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { CustomFieldType } from '@prisma/client';

import { ENTITY_TYPES } from '@/lib/entity-types';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

import { createFieldDefinition, deleteFieldDefinition, saveCustomFieldValues } from './service';

const FIELD_TYPES: CustomFieldType[] = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'];

function parseFieldType(value: FormDataEntryValue | null): CustomFieldType {
  return (FIELD_TYPES as string[]).includes(String(value)) ? (value as CustomFieldType) : 'TEXT';
}

// GE-09: administrator definerer feltene selv, uten hjelp fra utvikler.
export async function createFieldDefinitionAction(formData: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.CUSTOM_FIELDS_MANAGE);

  const entityType = String(formData.get('entityType') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const fieldType = parseFieldType(formData.get('fieldType'));
  const options = String(formData.get('options') ?? '')
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean);

  if (!label) {
    redirect('/admin/custom-fields?error=missing_label');
  }

  await createFieldDefinition({ entityType, label, fieldType, options });

  revalidatePath('/admin/custom-fields');
}

export async function deleteFieldDefinitionAction(formData: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.CUSTOM_FIELDS_MANAGE);
  const id = String(formData.get('id') ?? '');

  await deleteFieldDefinition(id);

  revalidatePath('/admin/custom-fields');
}

const WRITE_PERMISSION_BY_ENTITY_TYPE: Record<string, string> = {
  [ENTITY_TYPES.CUSTOMER]: PERMISSIONS.CUSTOMER_WRITE,
  [ENTITY_TYPES.SUPPLIER]: PERMISSIONS.SUPPLIER_WRITE,
  [ENTITY_TYPES.QUOTE]: PERMISSIONS.QUOTE_WRITE,
  [ENTITY_TYPES.ORDER]: PERMISSIONS.ORDER_WRITE,
};

const DETAIL_PATH_BY_ENTITY_TYPE: Record<string, (entityId: string) => string> = {
  [ENTITY_TYPES.CUSTOMER]: (id) => `/customers/${id}`,
  [ENTITY_TYPES.SUPPLIER]: (id) => `/suppliers/${id}`,
  [ENTITY_TYPES.QUOTE]: (id) => `/quotes/${id}`,
  [ENTITY_TYPES.ORDER]: (id) => `/orders/${id}`,
};

/** GE-09: lagrer egendefinerte feltverdier på en kunde/leverandør/tilbud/ordre. */
export async function saveCustomFieldValuesAction(formData: FormData): Promise<void> {
  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '');
  const permission = WRITE_PERMISSION_BY_ENTITY_TYPE[entityType];
  if (!permission) {
    throw new Error(`Ukjent entitetstype for egendefinerte felt: ${entityType}`);
  }
  await requirePermission(permission);

  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    const key = name.match(/^customField__(.+)$/)?.[1];
    if (key) {
      values[key] = String(value);
    }
  }

  await saveCustomFieldValues(entityType, entityId, values);

  const path = DETAIL_PATH_BY_ENTITY_TYPE[entityType]?.(entityId);
  if (path) {
    revalidatePath(path);
  }
}
