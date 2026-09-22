// Felles `entityType`-strenger brukt av AuditLog, Activity og Task, slik at
// de ikke skrives ulikt (case, entall/flertall) på tvers av moduler.
export const ENTITY_TYPES = {
  CUSTOMER: 'Customer',
  SUPPLIER: 'Supplier',
  ROLE: 'Role',
  USER: 'User',
  EMAIL_MESSAGE: 'EmailMessage',
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];
