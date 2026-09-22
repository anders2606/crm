// Norges Banks åpne valutakurs-API (SDMX/CSV), gratis og uten nøkkel (kap. 18).
// Bruker Node sin innebygde fetch – ingen ny avhengighet.
//
// IKKE verifisert mot den ekte tjenesten: utviklingsøkten denne ble bygget i
// tillater kun utgående HTTPS til et fast allowlist av verter (npm, PyPI osv.),
// og data.norges-bank.no er ikke blant dem. CSV-parsingen er skrevet etter
// beste kjennskap til Norges Banks dokumenterte SDMX-CSV-format (kolonnene
// TIME_PERIOD og OBS_VALUE er faste SDMX-navn), men bør bekreftes i praksis
// – se README for hvordan.
import type { ExchangeRateObservation, ExchangeRateProvider } from './types';

const BASE_URL = 'https://data.norges-bank.no/api/data/EXR';

export const realExchangeRateProvider: ExchangeRateProvider = {
  async fetchRates(currency, startDate, endDate) {
    const url = `${BASE_URL}/B.${currency}.NOK.SP?startPeriod=${startDate}&endPeriod=${endDate}&format=csv&locale=no`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Norges Bank svarte ${response.status} ${response.statusText} for ${currency}`);
    }
    const text = await response.text();
    return parseCsv(text, currency);
  },
};

function parseCsv(text: string, currency: string): ExchangeRateObservation[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return [];
  }

  const headerLine = lines[0]!;
  const semicolons = headerLine.match(/;/g)?.length ?? 0;
  const commas = headerLine.match(/,/g)?.length ?? 0;
  const delimiter = semicolons >= commas ? ';' : ',';

  const header = headerLine.split(delimiter).map((cell) => cell.replace(/"/g, '').trim());
  const dateIndex = header.indexOf('TIME_PERIOD');
  const valueIndex = header.indexOf('OBS_VALUE');
  if (dateIndex === -1 || valueIndex === -1) {
    throw new Error('Uventet CSV-format fra Norges Bank (fant ikke TIME_PERIOD/OBS_VALUE-kolonner)');
  }

  const observations: ExchangeRateObservation[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue;
    }
    const cells = line.split(delimiter).map((cell) => cell.replace(/"/g, '').trim());
    const date = cells[dateIndex];
    const rate = Number(cells[valueIndex]);
    if (date && Number.isFinite(rate)) {
      observations.push({ currency, date, rate });
    }
  }
  return observations;
}
