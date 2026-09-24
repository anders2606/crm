import { describe, expect, it } from 'vitest';

import { applyMergeFields } from '@/modules/campaigns/merge-fields';

describe('GR-04: flettefelt i nyhetsbrevmaler', () => {
  it('erstatter navn/firma/kontaktperson', () => {
    const result = applyMergeFields('Hei {{navn}} hos {{firma}} (v/ {{kontaktperson}})', {
      navn: 'Ola Nordmann',
      firma: 'Ola AS',
      kontaktperson: 'Kari Nordmann',
    });
    expect(result).toBe('Hei Ola Nordmann hos Ola AS (v/ Kari Nordmann)');
  });

  it('erstatter flere forekomster av samme felt', () => {
    const result = applyMergeFields('{{navn}}, hei {{navn}}!', { navn: 'Ola', firma: '', kontaktperson: '' });
    expect(result).toBe('Ola, hei Ola!');
  });

  it('lar innhold uten flettefelt stå uendret', () => {
    const result = applyMergeFields('Ingen flettefelt her.', { navn: 'x', firma: 'y', kontaktperson: 'z' });
    expect(result).toBe('Ingen flettefelt her.');
  });
});
