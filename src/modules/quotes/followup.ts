// OP-02–06: automatisk og manuell oppfølging av sendte tilbud.
import type { FollowUpRule } from '@prisma/client';

import { prisma } from '@/lib/db';

export interface ResolveFollowUpRuleInput {
  quoteId: string;
  customerId: string;
  customerGroupIds: string[];
}

/**
 * OP-05: finner regelen som gjelder for tilbudet, i prioritert rekkefølge
 * tilbud > kunde > kundegruppe > standard. Den mest spesifikke regelen som
 * finnes vinner i sin helhet – også dens av/på-status – uten å falle videre
 * til en mindre spesifikk regel. Dette gjør det mulig å slå av automatisk
 * oppfølging for ett enkelt tilbud uten at det påvirker andre tilbud.
 */
export async function resolveFollowUpRule(input: ResolveFollowUpRuleInput): Promise<FollowUpRule | null> {
  const quoteRule = await prisma.followUpRule.findUnique({ where: { quoteId: input.quoteId } });
  if (quoteRule) {
    return quoteRule;
  }

  const customerRule = await prisma.followUpRule.findUnique({ where: { customerId: input.customerId } });
  if (customerRule) {
    return customerRule;
  }

  if (input.customerGroupIds.length > 0) {
    const groupRule = await prisma.followUpRule.findFirst({
      where: { customerGroupId: { in: input.customerGroupIds } },
    });
    if (groupRule) {
      return groupRule;
    }
  }

  return prisma.followUpRule.findFirst({ where: { scope: 'DEFAULT' } });
}

/**
 * Regner ut når neste påminnelse skal sendes, gitt hvor mange som allerede
 * er sendt. `daysSequence` er antall dager etter at tilbudet ble sendt
 * (f.eks. [7, 14]). Returnerer `null` når alle påminnelsene i regelen er
 * brukt opp.
 */
export function computeNextFollowUpAt(sentAt: Date, daysSequence: number[], followUpsSent: number): Date | null {
  const nextDelayDays = daysSequence[followUpsSent];
  if (nextDelayDays === undefined) {
    return null;
  }
  const next = new Date(sentAt);
  next.setDate(next.getDate() + nextDelayDays);
  return next;
}
