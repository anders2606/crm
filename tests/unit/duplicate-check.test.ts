import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { findPotentialDuplicateCustomers } from '@/modules/customers/duplicate-check';

vi.mock('@/lib/db', () => ({
  prisma: {
    customer: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const findManyMock = vi.mocked(prisma.customer.findMany);

describe('duplikatkontroll (KU-10: navn, e-post, org.nr.)', () => {
  beforeEach(() => {
    findManyMock.mockClear();
  });

  it('sjekker org.nr (uten mellomrom), e-post og navn – alle case-insensitive', async () => {
    await findPotentialDuplicateCustomers({
      name: 'Ola Nordmann',
      email: 'Ola@Example.com',
      orgNr: '123 456 789',
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: [
            { orgNr: { equals: '123456789', mode: 'insensitive' } },
            { email: { equals: 'ola@example.com', mode: 'insensitive' } },
            { name: { equals: 'Ola Nordmann', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('spør ikke databasen når det ikke er noe å sjekke mot', async () => {
    const result = await findPotentialDuplicateCustomers({ name: '' });
    expect(result).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
