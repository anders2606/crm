// Felles grensesnitt for valutakursintegrasjonen (kap. 15/18, arbeidsregel 12).
export interface ExchangeRateObservation {
  currency: string;
  /** ISO-dato (YYYY-MM-DD). */
  date: string;
  /** NOK per 1 enhet av valutaen. */
  rate: number;
}

export interface ExchangeRateProvider {
  fetchRates(currency: string, startDate: string, endDate: string): Promise<ExchangeRateObservation[]>;
}
