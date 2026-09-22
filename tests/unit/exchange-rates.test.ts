import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { getMicroNokPerUnit, syncExchangeRates } from '@/modules/exchange-rates/service';
import { resetMockRates, seedMockRates } from '@/integrations/exchange-rates';

vi.mock('@/lib/db', () => ({
  prisma: {
    exchangeRate: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

const upsertMock = vi.mocked(prisma.exchangeRate.upsert);
const findUniqueMock = vi.mocked(prisma.exchangeRate.findUnique);
const findFirstMock = vi.mocked(prisma.exchangeRate.findFirst);

describe('valutakurser (MA-03, kap. 18)', () => {
  beforeEach(() => {
    upsertMock.mockReset();
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    resetMockRates();
  });

  it('NOK trenger ingen oppslag: kurs er alltid 1 000 000 (1,000000)', async () => {
    expect(await getMicroNokPerUnit('NOK', new Date('2026-01-15'))).toBe(1_000_000);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('bruker eksakt kurs for datoen når den finnes', async () => {
    findUniqueMock.mockResolvedValueOnce({ microNokPerUnit: 11_500_000 } as never);

    expect(await getMicroNokPerUnit('EUR', new Date('2026-01-15'))).toBe(11_500_000);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('faller tilbake til siste kjente kurs før datoen ved helg/helligdag', async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce({ microNokPerUnit: 11_480_000 } as never);

    const result = await getMicroNokPerUnit('EUR', new Date('2026-01-17')); // en lørdag

    expect(result).toBe(11_480_000);
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { currency: 'EUR', date: { lte: expect.any(Date) } } }),
    );
  });

  it('returnerer null når ingen kurs finnes i det hele tatt', async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce(null);

    expect(await getMicroNokPerUnit('EUR', new Date('2020-01-01'))).toBeNull();
  });

  it('henter fra integrasjonen og lagrer hver observasjon', async () => {
    seedMockRates('EUR', [
      { currency: 'EUR', date: '2026-01-14', rate: 11.45 },
      { currency: 'EUR', date: '2026-01-15', rate: 11.5 },
    ]);

    const count = await syncExchangeRates('EUR', new Date('2026-01-14'), new Date('2026-01-15'));

    expect(count).toBe(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currency: 'EUR', microNokPerUnit: 11_500_000 }),
      }),
    );
  });

  it('gjør ingenting for NOK', async () => {
    const count = await syncExchangeRates('NOK', new Date('2026-01-01'), new Date('2026-01-02'));
    expect(count).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
