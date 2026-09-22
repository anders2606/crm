// Mock-variant brukt i alle automatiske tester og som standard i utvikling
// (arbeidsregel 5/12 – ekte PowerOffice-trafikk skjer kun fra workeren, og
// kun når PowerOffice-tilkoblingen faktisk er satt opp med ekte nøkler).
import { randomUUID } from 'node:crypto';

import type {
  PowerOfficeClient,
  PowerOfficeContactMatch,
  PowerOfficeCustomerBalance,
  PowerOfficeCustomerInput,
  PowerOfficeIncomingInvoice,
  PowerOfficeSalesOrderInput,
  PowerOfficeSupplierInput,
} from './types';

interface MockCustomerRecord extends PowerOfficeContactMatch, PowerOfficeCustomerInput {}
interface MockSupplierRecord extends PowerOfficeContactMatch, PowerOfficeSupplierInput {}

const customers = new Map<string, MockCustomerRecord>();
const suppliers = new Map<string, MockSupplierRecord>();
const balances = new Map<string, PowerOfficeCustomerBalance>();
const salesOrders = new Map<string, PowerOfficeSalesOrderInput>();
const incomingInvoicesBySupplier = new Map<string, PowerOfficeIncomingInvoice[]>();

export function resetMockPowerOffice(): void {
  customers.clear();
  suppliers.clear();
  balances.clear();
  salesOrders.clear();
  incomingInvoicesBySupplier.clear();
}

/** Setter opp en eksisterende PowerOffice-kunde for match-testing (IN-01). */
export function seedMockPowerOfficeCustomer(record: MockCustomerRecord): void {
  customers.set(record.powerOfficeId, record);
}

export function seedMockPowerOfficeSupplier(record: MockSupplierRecord): void {
  suppliers.set(record.powerOfficeId, record);
}

export function seedMockPowerOfficeBalance(powerOfficeId: string, balance: PowerOfficeCustomerBalance): void {
  balances.set(powerOfficeId, balance);
}

export function getMockSalesOrders(): Map<string, PowerOfficeSalesOrderInput> {
  return salesOrders;
}

export function seedMockIncomingInvoices(supplierPowerOfficeId: string, invoices: PowerOfficeIncomingInvoice[]): void {
  incomingInvoicesBySupplier.set(supplierPowerOfficeId, invoices);
}

function findByOrgNrOrEmail<T extends PowerOfficeContactMatch>(
  records: Map<string, T>,
  orgNr: string | null,
  email: string | null,
): T | null {
  if (orgNr) {
    const byOrgNr = [...records.values()].find((record) => record.orgNr === orgNr);
    if (byOrgNr) {
      return byOrgNr;
    }
  }
  if (email) {
    const byEmail = [...records.values()].find((record) => record.email === email);
    if (byEmail) {
      return byEmail;
    }
  }
  return null;
}

export const mockPowerOfficeClient: PowerOfficeClient = {
  async findCustomerByOrgNrOrEmail(orgNr, email) {
    return findByOrgNrOrEmail(customers, orgNr, email);
  },

  async createCustomer(input) {
    const powerOfficeId = randomUUID();
    customers.set(powerOfficeId, { powerOfficeId, ...input });
    return powerOfficeId;
  },

  async updateCustomer(powerOfficeId, input) {
    const existing = customers.get(powerOfficeId);
    if (!existing) {
      throw new Error(`Mock PowerOffice: fant ikke kunde ${powerOfficeId}`);
    }
    customers.set(powerOfficeId, { ...existing, ...input });
  },

  async listCustomers() {
    return [...customers.values()];
  },

  async findSupplierByOrgNrOrEmail(orgNr, email) {
    return findByOrgNrOrEmail(suppliers, orgNr, email);
  },

  async createSupplier(input) {
    const powerOfficeId = randomUUID();
    suppliers.set(powerOfficeId, { powerOfficeId, ...input });
    return powerOfficeId;
  },

  async updateSupplier(powerOfficeId, input) {
    const existing = suppliers.get(powerOfficeId);
    if (!existing) {
      throw new Error(`Mock PowerOffice: fant ikke leverandør ${powerOfficeId}`);
    }
    suppliers.set(powerOfficeId, { ...existing, ...input });
  },

  async listSuppliers() {
    return [...suppliers.values()];
  },

  async getCustomerBalance(powerOfficeId) {
    return balances.get(powerOfficeId) ?? { outstandingBalanceMinor: 0, overdueAmountMinor: 0, openItems: [] };
  },

  async createSalesOrder(input) {
    const powerOfficeId = randomUUID();
    salesOrders.set(powerOfficeId, input);
    return powerOfficeId;
  },

  async listIncomingInvoicesForSupplier(powerOfficeId) {
    return incomingInvoicesBySupplier.get(powerOfficeId) ?? [];
  },
};
