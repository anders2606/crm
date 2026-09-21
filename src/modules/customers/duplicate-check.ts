// KU-10: duplikatkontroll ved registrering (navn, e-post, org.nr.).
import { prisma } from '@/lib/db';

export interface DuplicateCandidateInput {
  name: string;
  email?: string | null;
  orgNr?: string | null;
}

export async function findPotentialDuplicateCustomers(input: DuplicateCandidateInput) {
  const orgNr = input.orgNr?.replace(/\s+/g, '') || null;
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name.trim();

  const or: Array<Record<string, unknown>> = [];
  if (orgNr) {
    or.push({ orgNr: { equals: orgNr, mode: 'insensitive' } });
  }
  if (email) {
    or.push({ email: { equals: email, mode: 'insensitive' } });
  }
  if (name) {
    or.push({ name: { equals: name, mode: 'insensitive' } });
  }

  if (or.length === 0) {
    return [];
  }

  return prisma.customer.findMany({
    where: { deletedAt: null, OR: or },
    take: 5,
    orderBy: { name: 'asc' },
  });
}
