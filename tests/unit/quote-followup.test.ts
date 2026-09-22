import { describe, expect, it } from 'vitest';

import { computeNextFollowUpAt } from '@/modules/quotes/followup';

describe('OP-03: automatisk oppfølging etter antall dager i regelen', () => {
  it('regner ut dato for første påminnelse', () => {
    const sentAt = new Date('2026-01-01T10:00:00Z');
    const next = computeNextFollowUpAt(sentAt, [7, 14], 0);
    expect(next?.toISOString().slice(0, 10)).toBe('2026-01-08');
  });

  it('regner ut dato for andre påminnelse etter at første er sendt', () => {
    const sentAt = new Date('2026-01-01T10:00:00Z');
    const next = computeNextFollowUpAt(sentAt, [7, 14], 1);
    expect(next?.toISOString().slice(0, 10)).toBe('2026-01-15');
  });

  it('returnerer null når alle påminnelser i regelen er brukt opp', () => {
    const sentAt = new Date('2026-01-01T10:00:00Z');
    expect(computeNextFollowUpAt(sentAt, [7, 14], 2)).toBeNull();
  });
});
