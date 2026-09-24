import { describe, expect, it } from 'vitest';

import { buildCsv } from '@/lib/csv';

describe('GE-10: CSV-bygger', () => {
  it('separerer felt med semikolon og linjer med CRLF', () => {
    const csv = buildCsv(['Navn', 'Sum'], [['Ola', 100], ['Kari', 200]]);
    expect(csv).toBe('﻿Navn;Sum\r\nOla;100\r\nKari;200\r\n');
  });

  it('escaper felt som inneholder semikolon, anførselstegn eller linjeskift', () => {
    const csv = buildCsv(['Felt'], [['Verdi; med semikolon'], ['Med "sitat"'], ['Med\nlinjeskift']]);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[1]).toBe('"Verdi; med semikolon"');
    expect(lines[2]).toBe('"Med ""sitat"""');
    expect(lines[3]).toBe('"Med\nlinjeskift"');
  });
});
