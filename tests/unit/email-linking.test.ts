import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { findEntityForAddresses } from '@/modules/email/linking';

vi.mock('@/lib/db', () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    supplier: { findFirst: vi.fn() },
    contactPerson: { findFirst: vi.fn() },
  },
}));

const customerFindFirst = vi.mocked(prisma.customer.findFirst);
const supplierFindFirst = vi.mocked(prisma.supplier.findFirst);
const contactFindFirst = vi.mocked(prisma.contactPerson.findFirst);

describe('automatisk kobling av e-post til kunde/leverandør (EP-02)', () => {
  beforeEach(() => {
    customerFindFirst.mockReset().mockResolvedValue(null);
    supplierFindFirst.mockReset().mockResolvedValue(null);
    contactFindFirst.mockReset().mockResolvedValue(null);
  });

  it('returnerer null uten adresser å sjekke', async () => {
    expect(await findEntityForAddresses([])).toBeNull();
    expect(customerFindFirst).not.toHaveBeenCalled();
  });

  it('matcher på eksakt kunde-e-post først', async () => {
    customerFindFirst.mockResolvedValueOnce({ id: 'kunde-1' } as never);

    const match = await findEntityForAddresses(['Ola@Marmor.no']);
    expect(match).toEqual({ entityType: 'Customer', entityId: 'kunde-1' });
  });

  it('faller tilbake til domene når ingen eksakt treff finnes', async () => {
    const domainCall = customerFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'kunde-domene',
    } as never);

    const match = await findEntityForAddresses(['ukjent.person@marmor.no']);
    expect(match).toEqual({ entityType: 'Customer', entityId: 'kunde-domene' });

    // Andre kallet skal søke på domene, ikke eksakt adresse.
    const secondCallArgs = domainCall.mock.calls[1]?.[0];
    expect(secondCallArgs?.where?.email?.endsWith).toBe('@marmor.no');
  });

  it('kobler ALDRI på domene for store, offentlige webmail-tjenester', async () => {
    const match = await findEntityForAddresses(['noen@gmail.com']);
    expect(match).toBeNull();
    // Ingen domene-oppslag skal gjøres for gmail.com.
    expect(customerFindFirst).toHaveBeenCalledTimes(1); // kun det eksakte oppslaget
  });
});
