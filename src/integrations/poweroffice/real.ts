// Ekte PowerOffice Go API v2-klient (kap. 15/18). Kalles KUN fra workeren
// (arbeidsregel 12).
//
// IKKE verifisert mot den ekte tjenesten i denne utviklingsøkten: sandkassen
// tillater kun utgående HTTPS til et fast allowlist av verter (npm-registeret
// o.l.), og både developer.poweroffice.net og *.azure-api.net er blokkert
// herfra. Selve API-endepunktene under (stier, felt- og skjemanavn) er
// hentet direkte fra docs/poweroffice-apiv2-demo.json, den ekte OpenAPI-
// spesifikasjonen eieren lastet ned fra PowerOffice sitt utviklerportal – de
// er IKKE gjettet. OAuth2-token-utvekslingen (som ikke er del av selve
// API-spesifikasjonen) er satt sammen fra PowerOffice sin dokumenterte
// beskrivelse av strømmen (Basic-header av appKey:clientKey, form-urlencoded
// grant_type=client_credentials, abonnementsnøkkel-header) og verifisert
// samstemt mot to uavhengige tredjeparts Node-klienter for samme API
// (bekreftet identisk tokenUrl/baseUrl-mønster og feltnavn access_token/
// expires_in i begge). Dette er beste innsats uten en levende tilkobling –
// se README for hvordan du selv bekrefter det mot demo-miljøet.
import type {
  PowerOfficeClient,
  PowerOfficeContactMatch,
  PowerOfficeCredentials,
  PowerOfficeCustomerBalance,
  PowerOfficeCustomerInput,
  PowerOfficeIncomingInvoice,
  PowerOfficeOpenItem,
  PowerOfficeSalesOrderInput,
  PowerOfficeSupplierInput,
} from './types';

const DEFAULT_URLS: Record<PowerOfficeCredentials['environment'], { apiBaseUrl: string; tokenUrl: string }> = {
  // Verifisert direkte fra "servers" i docs/poweroffice-apiv2-demo.json.
  DEMO: {
    apiBaseUrl: 'https://proddemo-go-apim-apiv2-eurw.azure-api.net/demo/v2',
    tokenUrl: 'https://goapi.poweroffice.net/Demo/OAuth/Token',
  },
  // Produksjons-URL-en er IKKE del av demo-spesifikasjonen og er derfor et
  // beste anslag ut fra samme mønster – bekreft i PowerOffice sin
  // utviklerdokumentasjon og bruk apiBaseUrlOverride/tokenUrlOverride i
  // innstillingene hvis den avviker.
  PRODUCTION: {
    apiBaseUrl: 'https://goapi.poweroffice.net/v2',
    tokenUrl: 'https://goapi.poweroffice.net/OAuth/Token',
  },
};

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

function cacheKey(credentials: PowerOfficeCredentials): string {
  return `${credentials.environment}:${credentials.clientKey}`;
}

function resolveUrls(credentials: PowerOfficeCredentials): { apiBaseUrl: string; tokenUrl: string } {
  const defaults = DEFAULT_URLS[credentials.environment];
  return {
    apiBaseUrl: credentials.apiBaseUrlOverride || defaults.apiBaseUrl,
    tokenUrl: credentials.tokenUrlOverride || defaults.tokenUrl,
  };
}

async function getAccessToken(credentials: PowerOfficeCredentials): Promise<string> {
  const key = cacheKey(credentials);
  const cached = tokenCache.get(key);
  // 60 sekunder margin før faktisk utløp (kap. 18: tokenet varer 20 minutter).
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const { tokenUrl } = resolveUrls(credentials);
  const basicAuth = Buffer.from(`${credentials.applicationKey}:${credentials.clientKey}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Ocp-Apim-Subscription-Key': credentials.subscriptionKey,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });

  if (!response.ok) {
    throw new Error(`PowerOffice-autentisering feilet: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new Error('PowerOffice-autentisering: fikk ikke access_token i svaret');
  }

  const expiresInSeconds = body.expires_in ?? 1200;
  const token: CachedToken = {
    accessToken: body.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  tokenCache.set(key, token);
  return token.accessToken;
}

/**
 * kap. 18: /SalesOrders/Complete (og andre endepunkter under last) svarer
 * 503 ved overbelastning – ett nytt forsøk etter kort pause er nok i
 * demo-miljøet, som har lavt volum i praksis.
 */
async function requestJson(
  credentials: PowerOfficeCredentials,
  path: string,
  init: { method: string; body?: unknown; query?: Record<string, string | undefined> },
): Promise<unknown> {
  const { apiBaseUrl } = resolveUrls(credentials);
  const url = new URL(apiBaseUrl + path);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  // PATCH-endepunktene bruker JSON Patch (RFC 6902), som krever sin egen
  // content-type – vanlig application/json godtas ikke der.
  const contentType = init.method === 'PATCH' ? 'application/json-patch+json' : 'application/json';

  const attempt = async (): Promise<Response> => {
    const token = await getAccessToken(credentials);
    return fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': credentials.subscriptionKey,
        ...(init.body !== undefined ? { 'Content-Type': contentType } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  };

  let response = await attempt();
  if (response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    response = await attempt();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PowerOffice ${init.method} ${path} svarte ${response.status} ${response.statusText}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

// PowerOffice bruker beløp som desimaltall i klientens valuta (kroner, ikke
// øre) – se eksempler i docs/poweroffice-apiv2-demo.json (f.eks.
// CustomerLedgerEntryDto). Konverteres til/fra øre her (arbeidsregel 10).
export function minorToDecimal(minor: number): number {
  return Math.round(minor) / 100;
}

export function decimalToMinor(decimal: number): number {
  return Math.round(decimal * 100);
}

interface RawCustomer {
  Id: number;
  Name: string | null;
  OrganizationNumber: string | null;
  EmailAddress: string | null;
  PhoneNumber: string | null;
  PaymentTerm: number | null;
}

function mapCustomer(raw: RawCustomer): PowerOfficeContactMatch & PowerOfficeCustomerInput {
  return {
    powerOfficeId: String(raw.Id),
    name: raw.Name ?? '',
    orgNr: raw.OrganizationNumber,
    email: raw.EmailAddress,
    phone: raw.PhoneNumber,
    paymentTermsDays: raw.PaymentTerm,
  };
}

function customerToPostBody(input: PowerOfficeCustomerInput): Record<string, unknown> {
  return {
    Name: input.name,
    IsPerson: false,
    OrganizationNumber: input.orgNr,
    EmailAddress: input.email,
    PhoneNumber: input.phone,
    PaymentTerm: input.paymentTermsDays,
  };
}

function customerToPatchBody(input: PowerOfficeCustomerInput): Array<{ op: string; path: string; value: unknown }> {
  return [
    { op: 'replace', path: '/Name', value: input.name },
    { op: 'replace', path: '/OrganizationNumber', value: input.orgNr },
    { op: 'replace', path: '/EmailAddress', value: input.email },
    { op: 'replace', path: '/PhoneNumber', value: input.phone },
    { op: 'replace', path: '/PaymentTerm', value: input.paymentTermsDays },
  ];
}

interface RawSupplier {
  Id: number;
  Name: string | null;
  OrganizationNumber: string | null;
  EmailAddress: string | null;
  PhoneNumber: string | null;
  PaymentTermSupplierId: string | null;
}

function mapSupplier(raw: RawSupplier): PowerOfficeContactMatch & PowerOfficeSupplierInput {
  return {
    powerOfficeId: String(raw.Id),
    name: raw.Name ?? '',
    orgNr: raw.OrganizationNumber,
    email: raw.EmailAddress,
    phone: raw.PhoneNumber,
    paymentTermsDays: null,
  };
}

function supplierToPostBody(input: PowerOfficeSupplierInput): Record<string, unknown> {
  return {
    Name: input.name,
    OrganizationNumber: input.orgNr,
    EmailAddress: input.email,
    PhoneNumber: input.phone,
  };
}

function supplierToPatchBody(input: PowerOfficeSupplierInput): Array<{ op: string; path: string; value: unknown }> {
  return [
    { op: 'replace', path: '/Name', value: input.name },
    { op: 'replace', path: '/OrganizationNumber', value: input.orgNr },
    { op: 'replace', path: '/EmailAddress', value: input.email },
    { op: 'replace', path: '/PhoneNumber', value: input.phone },
  ];
}

interface RawCustomerLedgerEntry {
  Amount: number;
  Balance: number;
  DueDate: string | null;
  InvoiceNo: string | null;
}

interface RawIncomingInvoice {
  Id: string;
  InvoiceNo: string | null;
  TotalAmount: number;
  Balance: number;
  DueDate: string | null;
}

// Grenser hvor langt tilbake bilagsstatus hentes (samme mønster som
// valutakurs-backfill, src/worker/index.ts) – unngår å hente hele
// leverandørens fakturahistorikk hver gang.
const INCOMING_INVOICE_HISTORY_YEARS = 2;

export function createRealPowerOfficeClient(credentials: PowerOfficeCredentials): PowerOfficeClient {
  return {
    async findCustomerByOrgNrOrEmail(orgNr, email) {
      if (orgNr) {
        const byOrgNr = (await requestJson(credentials, '/Customers', {
          method: 'GET',
          query: { organizationNumbers: orgNr },
        })) as RawCustomer[];
        if (byOrgNr.length > 0) {
          return mapCustomer(byOrgNr[0]!);
        }
      }
      if (email) {
        const byEmail = (await requestJson(credentials, '/Customers', {
          method: 'GET',
          query: { emailAddresses: email },
        })) as RawCustomer[];
        if (byEmail.length > 0) {
          return mapCustomer(byEmail[0]!);
        }
      }
      return null;
    },

    async createCustomer(input) {
      const created = (await requestJson(credentials, '/Customers', {
        method: 'POST',
        body: customerToPostBody(input),
      })) as RawCustomer;
      return String(created.Id);
    },

    async updateCustomer(powerOfficeId, input) {
      await requestJson(credentials, `/Customers/${powerOfficeId}`, {
        method: 'PATCH',
        body: customerToPatchBody(input),
      });
    },

    async listCustomers() {
      const all = (await requestJson(credentials, '/Customers', { method: 'GET' })) as RawCustomer[];
      return all.map(mapCustomer);
    },

    async findSupplierByOrgNrOrEmail(orgNr, email) {
      if (orgNr) {
        const byOrgNr = (await requestJson(credentials, '/Suppliers', {
          method: 'GET',
          query: { organizationNumbers: orgNr },
        })) as RawSupplier[];
        if (byOrgNr.length > 0) {
          return mapSupplier(byOrgNr[0]!);
        }
      }
      if (email) {
        const byEmail = (await requestJson(credentials, '/Suppliers', {
          method: 'GET',
          query: { emailAddresses: email },
        })) as RawSupplier[];
        if (byEmail.length > 0) {
          return mapSupplier(byEmail[0]!);
        }
      }
      return null;
    },

    async createSupplier(input) {
      const created = (await requestJson(credentials, '/Suppliers', {
        method: 'POST',
        body: supplierToPostBody(input),
      })) as RawSupplier;
      return String(created.Id);
    },

    async updateSupplier(powerOfficeId, input) {
      await requestJson(credentials, `/Suppliers/${powerOfficeId}`, {
        method: 'PATCH',
        body: supplierToPatchBody(input),
      });
    },

    async listSuppliers() {
      const all = (await requestJson(credentials, '/Suppliers', { method: 'GET' })) as RawSupplier[];
      return all.map(mapSupplier);
    },

    async getCustomerBalance(powerOfficeId) {
      const today = new Date().toISOString().slice(0, 10);
      const entries = (await requestJson(credentials, '/Customerledger/OpenItems', {
        method: 'GET',
        query: { date: today, customerNos: powerOfficeId },
      })) as RawCustomerLedgerEntry[];

      const openItems: PowerOfficeOpenItem[] = entries.map((entry) => ({
        invoiceNo: entry.InvoiceNo,
        amountMinor: decimalToMinor(entry.Amount),
        dueDate: entry.DueDate,
      }));

      const outstandingBalanceMinor = openItems.reduce((sum, item) => sum + item.amountMinor, 0);
      const overdueAmountMinor = openItems
        .filter((item) => item.dueDate !== null && item.dueDate < today)
        .reduce((sum, item) => sum + item.amountMinor, 0);

      const balance: PowerOfficeCustomerBalance = { outstandingBalanceMinor, overdueAmountMinor, openItems };
      return balance;
    },

    async createSalesOrder(input) {
      const body = {
        CustomerId: Number(input.customerPowerOfficeId),
        CurrencyCode: input.currency,
        ExternalImportReference: input.orderNumber,
        SalesOrderLines: input.lines.map((line, index) => ({
          LineType: 'Normal',
          Description: line.description,
          Quantity: line.quantityMilli / 1000,
          ProductUnitPrice: minorToDecimal(line.unitPriceMinor),
          SortOrder: index,
        })),
      };
      const created = (await requestJson(credentials, '/SalesOrders/Complete', {
        method: 'POST',
        body,
      })) as { Id: number };
      return String(created.Id);
    },

    async listIncomingInvoicesForSupplier(powerOfficeId) {
      const fromDate = new Date();
      fromDate.setFullYear(fromDate.getFullYear() - INCOMING_INVOICE_HISTORY_YEARS);

      const invoices = (await requestJson(credentials, '/IncomingInvoices', {
        method: 'GET',
        query: { supplierNos: powerOfficeId, fromDate: fromDate.toISOString().slice(0, 10) },
      })) as RawIncomingInvoice[];

      return invoices.map((invoice) => ({
        powerOfficeId: invoice.Id,
        invoiceNo: invoice.InvoiceNo,
        totalAmountMinor: decimalToMinor(invoice.TotalAmount),
        balanceMinor: decimalToMinor(invoice.Balance),
        dueDate: invoice.DueDate,
      }));
    },
  };
}
