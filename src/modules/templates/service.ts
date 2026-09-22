// SD-01–04: maler og tekstblokker. Samme versjoneringsmønster som Document
// (M2): alle versjoner deler `groupId` (lik `id` for versjon 1), ny versjon
// setter forrige `isCurrent=false` men beholder den (aldri slettet, SD-03).
import { randomUUID } from 'node:crypto';

import type { Template, TemplateStatus, TemplateType, TextBlock } from '@prisma/client';

import { prisma } from '@/lib/db';

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  QUOTE: 'Tilbud',
  ORDER_CONFIRMATION: 'Ordrebekreftelse',
  EMAIL: 'E-post',
  FOLLOWUP: 'Oppfølging',
  NEWSLETTER: 'Nyhetsbrev',
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  DRAFT: 'Kladd',
  PUBLISHED: 'Publisert',
};

export interface CreateTemplateVersionInput {
  /** Sett når dette er en ny versjon av en eksisterende mal (SD-03). */
  replacesTemplateId?: string | null;
  type: TemplateType;
  name: string;
  language: string;
  customerGroupId?: string | null;
  content: string;
  status: TemplateStatus;
  comment?: string | null;
  userId: string | null;
}

export async function createTemplateVersion(input: CreateTemplateVersionInput): Promise<Template> {
  if (input.replacesTemplateId) {
    const previous = await prisma.template.findUniqueOrThrow({ where: { id: input.replacesTemplateId } });
    const [, created] = await prisma.$transaction([
      prisma.template.update({ where: { id: previous.id }, data: { isCurrent: false } }),
      prisma.template.create({
        data: {
          groupId: previous.groupId,
          version: previous.version + 1,
          isCurrent: true,
          type: input.type,
          name: input.name,
          language: input.language,
          customerGroupId: input.customerGroupId ?? null,
          content: input.content,
          status: input.status,
          comment: input.comment ?? null,
          createdById: input.userId,
        },
      }),
    ]);
    return created;
  }

  const id = randomUUID();
  return prisma.template.create({
    data: {
      id,
      groupId: id,
      version: 1,
      isCurrent: true,
      type: input.type,
      name: input.name,
      language: input.language,
      customerGroupId: input.customerGroupId ?? null,
      content: input.content,
      status: input.status,
      comment: input.comment ?? null,
      createdById: input.userId,
    },
  });
}

export interface CreateTextBlockVersionInput {
  replacesTextBlockId?: string | null;
  name: string;
  language: string;
  content: string;
  comment?: string | null;
  userId: string | null;
}

export async function createTextBlockVersion(input: CreateTextBlockVersionInput): Promise<TextBlock> {
  if (input.replacesTextBlockId) {
    const previous = await prisma.textBlock.findUniqueOrThrow({ where: { id: input.replacesTextBlockId } });
    const [, created] = await prisma.$transaction([
      prisma.textBlock.update({ where: { id: previous.id }, data: { isCurrent: false } }),
      prisma.textBlock.create({
        data: {
          groupId: previous.groupId,
          version: previous.version + 1,
          isCurrent: true,
          name: input.name,
          language: input.language,
          content: input.content,
          comment: input.comment ?? null,
          createdById: input.userId,
        },
      }),
    ]);
    return created;
  }

  const id = randomUUID();
  return prisma.textBlock.create({
    data: {
      id,
      groupId: id,
      version: 1,
      isCurrent: true,
      name: input.name,
      language: input.language,
      content: input.content,
      comment: input.comment ?? null,
      createdById: input.userId,
    },
  });
}

export interface ResolveTemplateInput {
  type: TemplateType;
  language: string;
  customerGroupId?: string | null;
}

/**
 * TO-02: finner malen som skal brukes for en gitt type/språk. En mal for
 * kundens spesifikke kundegruppe har forrang; ellers brukes en generisk mal
 * (customerGroupId = null) for samme type/språk. Kun publiserte, gjeldende
 * versjoner vurderes.
 */
export async function resolveTemplate(input: ResolveTemplateInput): Promise<Template | null> {
  if (input.customerGroupId) {
    const groupSpecific = await prisma.template.findFirst({
      where: {
        type: input.type,
        language: input.language,
        customerGroupId: input.customerGroupId,
        isCurrent: true,
        status: 'PUBLISHED',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (groupSpecific) {
      return groupSpecific;
    }
  }

  return prisma.template.findFirst({
    where: {
      type: input.type,
      language: input.language,
      customerGroupId: null,
      isCurrent: true,
      status: 'PUBLISHED',
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * SD-04: fryser mal- og tekstblokkinnhold til ett tekst-øyeblikksbilde som
 * lagres på tilbudet (Quote.termsSnapshot). En senere endring av malen
 * påvirker aldri et tilbud som allerede har fått snapshotet sitt satt.
 * Innholdet er ren tekst (ikke HTML), siden det brukes både i PDF-en
 * (@react-pdf/renderer) og som e-posttekst (M3s OutgoingMessage.text).
 */
export function buildTermsSnapshot(templateContent: string, textBlocks: TextBlock[]): string {
  const blocksText = textBlocks.map((block) => block.content).join('\n\n');
  return blocksText ? `${templateContent}\n\n${blocksText}` : templateContent;
}
