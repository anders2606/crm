// EP-05: manuell tilordning av e-post som ikke ble koblet automatisk.
import { recordActivity } from '@/lib/activity';
import { prisma } from '@/lib/db';
import { ENTITY_TYPES } from '@/lib/entity-types';
import { reparentDocuments } from '@/modules/documents/service';

export async function assignMessageToEntity(
  messageId: string,
  entityType: string,
  entityId: string,
  handledById: string,
): Promise<void> {
  const message = await prisma.emailMessage.update({
    where: { id: messageId },
    data: { entityType, entityId, handledById },
  });

  await reparentDocuments(ENTITY_TYPES.EMAIL_MESSAGE, message.id, entityType, entityId);

  await recordActivity({
    type: 'EMAIL',
    text: message.subject ? `E-post: ${message.subject}` : 'E-post uten emne',
    entityType,
    entityId,
    createdById: handledById,
    occurredAt: message.occurredAt,
  });
}
