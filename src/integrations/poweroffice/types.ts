// Felles grensesnitt for PowerOffice Go-integrasjonen (kap. 15/18,
// arbeidsregel 12: kalles kun fra workeren). Egne, rendyrkede domenetyper i
// stedet for å eksponere PowerOffice sine rå DTO-er (fra den genererte
// src/integrations/poweroffice/schema.d.ts) overalt i resten av appen – de
// rå formene (PascalCase, beløp i kroner med desimaler, numeriske id-er)
// holdes inne i real.ts/mock.ts og mappes om her (øre/heltall, arbeidsregel 10).
export type PowerOfficeEnvironmentValue = 'DEMO' | 'PRODUCTION';

export interface PowerOfficeCredentials {
  environment: PowerOfficeEnvironmentValue;
  applicationKey: string;
  clientKey: string;
  subscriptionKey: string;
  /** Tomme strenger betyr «bruk innebygd standard for miljøet». */
  apiBaseUrlOverride: string | null;
  tokenUrlOverride: string | null;
}

export interface PowerOfficeContactMatch {
  powerOfficeId: string;
  name: string;
  orgNr: string | null;
  email: string | null;
}

// KU-03: kredittgrense settes og eies i CRM, ikke i PowerOffice – kun
// utestående saldo hentes derfra (PowerOfficeCustomerBalance under).
export interface PowerOfficeCustomerInput {
  name: string;
  orgNr: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number | null;
}

// LE-04 (bankinfo/IBAN/BIC) krever PowerOffice sin egen ContactBankAccounts-
// ressurs (eget sett med endepunkter) og synkes ikke her ennå – bevisst
// utsatt, se README.
export interface PowerOfficeSupplierInput {
  name: string;
  orgNr: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number | null;
}

export interface PowerOfficeOpenItem {
  invoiceNo: string | null;
  amountMinor: number;
  dueDate: string | null;
}

export interface PowerOfficeCustomerBalance {
  outstandingBalanceMinor: number;
  overdueAmountMinor: number;
  openItems: PowerOfficeOpenItem[];
}

// PowerOffice sine salgsordrelinjer har ikke noe eget MVA-satsfelt – MVA
// beregnes av PowerOffice selv ut fra klientens standard salgskonto/MVA-kode
// (SalesOrderLinePostDto har verken VatRate- eller VatCode-felt på linjenivå).
export interface PowerOfficeSalesOrderLine {
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
}

export interface PowerOfficeSalesOrderInput {
  customerPowerOfficeId: string;
  orderNumber: string;
  currency: string;
  lines: PowerOfficeSalesOrderLine[];
}

// BI-02/03: én inngående faktura for en leverandør, med PowerOffice sin
// egen beregnede status (balanseløs = betalt) – CRM tolker aldri selv om en
// faktura er betalt.
export interface PowerOfficeIncomingInvoice {
  powerOfficeId: string;
  invoiceNo: string | null;
  totalAmountMinor: number;
  balanceMinor: number;
  dueDate: string | null;
}

export interface PowerOfficeClient {
  /** IN-01/KU-08: finner eksisterende post på org.nr først, så e-post. */
  findCustomerByOrgNrOrEmail(orgNr: string | null, email: string | null): Promise<PowerOfficeContactMatch | null>;
  createCustomer(input: PowerOfficeCustomerInput): Promise<string>;
  updateCustomer(powerOfficeId: string, input: PowerOfficeCustomerInput): Promise<void>;
  listCustomers(): Promise<Array<PowerOfficeContactMatch & PowerOfficeCustomerInput>>;

  findSupplierByOrgNrOrEmail(orgNr: string | null, email: string | null): Promise<PowerOfficeContactMatch | null>;
  createSupplier(input: PowerOfficeSupplierInput): Promise<string>;
  updateSupplier(powerOfficeId: string, input: PowerOfficeSupplierInput): Promise<void>;
  listSuppliers(): Promise<Array<PowerOfficeContactMatch & PowerOfficeSupplierInput>>;

  /** IN-03/KU-03: utestående saldo og forfalte poster for én kunde. */
  getCustomerBalance(powerOfficeId: string): Promise<PowerOfficeCustomerBalance>;

  /** IN-02: overfører et ordre-/fakturagrunnlag, returnerer PowerOffice-id. */
  createSalesOrder(input: PowerOfficeSalesOrderInput): Promise<string>;

  /** BI-02/03: inngående fakturaer registrert på én leverandør. */
  listIncomingInvoicesForSupplier(powerOfficeId: string): Promise<PowerOfficeIncomingInvoice[]>;
}
