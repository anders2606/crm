// Mock-variant brukt i alle automatiske tester og som standard i utvikling.
import type { ExchangeRateObservation, ExchangeRateProvider } from './types';

const seeded = new Map<string, ExchangeRateObservation[]>();

export function seedMockRates(currency: string, observations: ExchangeRateObservation[]): void {
  seeded.set(currency, observations);
}

export function resetMockRates(): void {
  seeded.clear();
}

export const mockExchangeRateProvider: ExchangeRateProvider = {
  async fetchRates(currency, startDate, endDate) {
    const all = seeded.get(currency) ?? [];
    return all.filter((observation) => observation.date >= startDate && observation.date <= endDate);
  },
};
