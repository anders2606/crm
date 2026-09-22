// Fabrikk som velger mock (standard) eller ekte PowerOffice-tilkobling. Kun
// workeren setter POWEROFFICE_INTEGRATION_MODE=real (arbeidsregel 5/12).
import { mockPowerOfficeClient } from './mock';
import { createRealPowerOfficeClient } from './real';
import type { PowerOfficeClient, PowerOfficeCredentials } from './types';

export * from './types';
export {
  getMockSalesOrders,
  mockPowerOfficeClient,
  resetMockPowerOffice,
  seedMockIncomingInvoices,
  seedMockOutgoingInvoice,
  seedMockPowerOfficeBalance,
  seedMockPowerOfficeCustomer,
  seedMockPowerOfficeSupplier,
} from './mock';

export function getPowerOfficeClient(credentials: PowerOfficeCredentials | null): PowerOfficeClient {
  if (process.env.POWEROFFICE_INTEGRATION_MODE === 'real' && credentials) {
    return createRealPowerOfficeClient(credentials);
  }
  return mockPowerOfficeClient;
}
