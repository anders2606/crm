import { describe, expect, it } from 'vitest';

import { formatQuoteNumber } from '@/modules/quotes/numbering';

describe('TO-15/TO-10: nummerering og revisjonssuffiks', () => {
  it('viser revisjon 1 uten suffiks', () => {
    expect(formatQuoteNumber(10001, 1)).toBe('T-10001');
  });

  it('viser senere revisjoner med suffiks', () => {
    expect(formatQuoteNumber(10001, 2)).toBe('T-10001-2');
    expect(formatQuoteNumber(10001, 3)).toBe('T-10001-3');
  });
});
