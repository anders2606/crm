// GE-09: egendefinerte felt uten programmering. Administrator definerer
// feltene per entitetstype i admin-UI; verdiene lagres generisk med samme
// entityType+entityId-mønster som Activity/Task/Document (M1/M2), slik at
// ingen migrering trengs når et felt legges til eller fjernes.
import type { CustomFieldDefinition, CustomFieldType } from '@prisma/client';

import { ENTITY_TYPES } from '@/lib/entity-types';
import { prisma } from '@/lib/db';

export const CUSTOM_FIELD_ENTITY_TYPES: { value: string; label: string }[] = [
  { value: ENTITY_TYPES.CUSTOMER, label: 'Kunde' },
  { value: ENTITY_TYPES.SUPPLIER, label: 'Leverandør' },
  { value: ENTITY_TYPES.QUOTE, label: 'Tilbud' },
  { value: ENTITY_TYPES.ORDER, label: 'Ordre' },
];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Tekst',
  NUMBER: 'Tall',
  DATE: 'Dato',
  BOOLEAN: 'Ja/nei',
  SELECT: 'Valgliste',
};

function slugifyKey(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[æå]/g, 'a')
      .replace(/ø/g, 'o')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'felt'
  );
}

export async function listFieldDefinitions(entityType: string): Promise<CustomFieldDefinition[]> {
  return prisma.customFieldDefinition.findMany({ where: { entityType }, orderBy: { sortOrder: 'asc' } });
}

export interface CreateFieldDefinitionInput {
  entityType: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
}

/** Genererer en unik nøkkel fra etiketten (f.eks. «Fargekode» → `fargekode`, `fargekode_2` ved kollisjon). */
export async function createFieldDefinition(input: CreateFieldDefinitionInput): Promise<CustomFieldDefinition> {
  const baseKey = slugifyKey(input.label);
  let key = baseKey;
  let suffix = 2;
  while (
    await prisma.customFieldDefinition.findUnique({
      where: { entityType_key: { entityType: input.entityType, key } },
    })
  ) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  const maxSortOrder = await prisma.customFieldDefinition.aggregate({
    where: { entityType: input.entityType },
    _max: { sortOrder: true },
  });

  return prisma.customFieldDefinition.create({
    data: {
      entityType: input.entityType,
      key,
      label: input.label,
      fieldType: input.fieldType,
      options: input.fieldType === 'SELECT' ? input.options : [],
      sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

/** Sletter definisjonen og alle registrerte verdier for feltet (uansett hvilken entitet de står på). */
export async function deleteFieldDefinition(id: string): Promise<void> {
  const definition = await prisma.customFieldDefinition.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.customFieldValue.deleteMany({ where: { entityType: definition.entityType, key: definition.key } }),
    prisma.customFieldDefinition.delete({ where: { id } }),
  ]);
}

export interface CustomFieldWithValue {
  definition: CustomFieldDefinition;
  value: string | null;
}

export async function loadCustomFieldsForEntity(entityType: string, entityId: string): Promise<CustomFieldWithValue[]> {
  const [definitions, values] = await Promise.all([
    listFieldDefinitions(entityType),
    prisma.customFieldValue.findMany({ where: { entityType, entityId } }),
  ]);
  const valueByKey = new Map(values.map((value) => [value.key, value.value]));
  return definitions.map((definition) => ({ definition, value: valueByKey.get(definition.key) ?? null }));
}

/** Lagrer verdier for en entitet. Tom streng sletter en eventuell eksisterende verdi. */
export async function saveCustomFieldValues(
  entityType: string,
  entityId: string,
  values: Record<string, string>,
): Promise<void> {
  const definitions = await listFieldDefinitions(entityType);
  const definedKeys = new Set(definitions.map((definition) => definition.key));

  await prisma.$transaction(
    Object.entries(values)
      .filter(([key]) => definedKeys.has(key))
      .map(([key, value]) =>
        value.trim() === ''
          ? prisma.customFieldValue.deleteMany({ where: { entityType, entityId, key } })
          : prisma.customFieldValue.upsert({
              where: { entityType_entityId_key: { entityType, entityId, key } },
              create: { entityType, entityId, key, value },
              update: { value },
            }),
      ),
  );
}
