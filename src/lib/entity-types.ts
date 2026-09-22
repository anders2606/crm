// Felles `entityType`-strenger brukt av AuditLog, Activity og Task, slik at
// de ikke skrives ulikt (case, entall/flertall) på tvers av moduler.
export const ENTITY_TYPES = {
  CUSTOMER: 'Customer',
  SUPPLIER: 'Supplier',
  ROLE: 'Role',
  USER: 'User',
  EMAIL_MESSAGE: 'EmailMessage',
  QUOTE: 'Quote',
  ORDER: 'Order',
  MATERIAL: 'Material',
  // SD-01: styrende dokumenter/planer gjenbruker Document med en fast
  // entityId, siden de ikke tilhører én bestemt kunde/leverandør/tilbud.
  GOVERNING_DOCUMENTS: 'GoverningDocuments',
} as const;

// SD-01: den ene, faste entityId-en for styrende dokumenter/planer.
export const GOVERNING_DOCUMENTS_ENTITY_ID = 'singleton';

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];
