import { describe, expect, it } from 'vitest';

import { generateApiKey, hashApiKey } from '@/lib/api-keys';

describe('GE-11: API-nøkler', () => {
  it('genererer nøkler med forventet prefiks og høy entropi', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.startsWith('pu_')).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it('hasher deterministisk (samme nøkkel gir samme hash)', () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('gir ulik hash for ulike nøkler', () => {
    expect(hashApiKey(generateApiKey())).not.toBe(hashApiKey(generateApiKey()));
  });
});
