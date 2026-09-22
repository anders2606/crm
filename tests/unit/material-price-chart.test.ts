import { describe, expect, it } from 'vitest';

import { buildPriceChartPath } from '@/modules/materials/service';

describe('prisgraf for materialer (MA-04)', () => {
  it('returnerer tom streng uten datapunkter', () => {
    expect(buildPriceChartPath([])).toBe('');
  });

  it('tegner en flat linje for ett enkelt datapunkt', () => {
    const path = buildPriceChartPath([{ date: new Date('2026-01-01'), amountNokMinor: 10_000 }]);
    expect(path).toMatch(/^M \d+ \d+ L \d+ \d+$/);
  });

  it('inkluderer ett linjesegment per ekstra datapunkt, i kronologisk rekkefølge', () => {
    const path = buildPriceChartPath([
      { date: new Date('2026-01-01'), amountNokMinor: 10_000 },
      { date: new Date('2026-02-01'), amountNokMinor: 12_000 },
      { date: new Date('2026-03-01'), amountNokMinor: 9_000 },
    ]);
    const segments = path.split(' L ');
    expect(segments).toHaveLength(3);
  });
});
