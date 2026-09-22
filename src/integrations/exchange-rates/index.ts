// Fabrikk som velger mock (standard) eller ekte Norges Bank-tilkobling. Kun
// workeren setter EXCHANGE_RATE_INTEGRATION_MODE=real (arbeidsregel 5/12).
import { mockExchangeRateProvider } from './mock';
import { realExchangeRateProvider } from './real';
import type { ExchangeRateProvider } from './types';

export * from './types';
export { mockExchangeRateProvider, resetMockRates, seedMockRates } from './mock';

export function getExchangeRateProvider(): ExchangeRateProvider {
  return process.env.EXCHANGE_RATE_INTEGRATION_MODE === 'real'
    ? realExchangeRateProvider
    : mockExchangeRateProvider;
}
