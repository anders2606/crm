// GE-10: enkel CSV-bygger uten ny avhengighet (arbeidsregel 11). Excel/Numre
// åpner denne direkte. Semikolon som skilletegn, siden Excel i norsk
// lokalisering forventer det (komma er allerede desimaltegn).
const DELIMITER = ';';

function escapeCsvField(value: string): string {
  if (value.includes(DELIMITER) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvField(String(cell))).join(DELIMITER),
  );
  // BOM slik at Excel tolker filen som UTF-8 (norske bokstaver vises riktig).
  return `﻿${lines.join('\r\n')}\r\n`;
}
