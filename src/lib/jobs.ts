// Arbeidsregel 12: eksterne systemer (her: SMTP) kalles kun fra workeren,
// aldri direkte i en brukerforespørsel. Denne modulen brukes fra Next.js-
// appen KUN til å legge en jobb i køen (en vanlig database-skriving mot vår
// egen Postgres, ikke et kall til et eksternt system) – selve SMTP-kallet
// skjer i src/worker/index.ts, som er den eneste prosessen som behandler
// (`work()`) disse køene.
import { PgBoss } from 'pg-boss';

export const QUOTE_SEND_QUEUE = 'quote-send';

export interface QuoteSendJobData {
  quoteId: string;
  emailAccountId: string;
  userId: string | null;
}

// IN-01/KU-08: match-eller-opprett kjøres i workeren for hver nye kunde/
// leverandør, slik at PowerOffice-kall aldri skjer i en brukerforespørsel.
export const POWEROFFICE_SYNC_QUEUE = 'poweroffice-sync';

export type PowerOfficeSyncJobData =
  | { kind: 'match-customer'; customerId: string }
  | { kind: 'match-supplier'; supplierId: string }
  | { kind: 'import-all' }
  | { kind: 'lookup-org-nr'; entityType: 'Customer' | 'Supplier'; orgNr: string }
  // IN-02: overfører et ordre-/fakturagrunnlag til PowerOffice.
  | { kind: 'transfer-order'; orderId: string; userId: string | null };

// IN-04: videresender en manuelt opplastet leverandørfaktura (PDF) som
// e-post til PowerOffice sitt fakturamottak. SMTP-kallet skjer kun i
// workeren (arbeidsregel 12, se src/modules/poweroffice/invoice-forward.ts).
export const POWEROFFICE_INVOICE_QUEUE = 'poweroffice-invoice-forward';

export interface PowerOfficeInvoiceForwardJobData {
  documentId: string;
  supplierId: string;
  emailAccountId: string;
  userId: string | null;
}

let producerPromise: Promise<PgBoss> | null = null;

async function getProducer(): Promise<PgBoss> {
  if (!producerPromise) {
    producerPromise = (async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL mangler i miljøvariabler (.env)');
      }
      const boss = new PgBoss(databaseUrl);
      boss.on('error', (error: Error) => console.error('[jobs] pg-boss-feil:', error));
      await boss.start();
      await boss.createQueue(QUOTE_SEND_QUEUE);
      await boss.createQueue(POWEROFFICE_SYNC_QUEUE);
      await boss.createQueue(POWEROFFICE_INVOICE_QUEUE);
      return boss;
    })();
  }
  return producerPromise;
}

/** TO-06: legger tilbudet i sendekøen. Selve sendingen skjer i workeren. */
export async function enqueueQuoteSend(data: QuoteSendJobData): Promise<void> {
  const boss = await getProducer();
  await boss.send(QUOTE_SEND_QUEUE, data);
}

/** IN-01/IN-02/KU-08: legger en PowerOffice-synkjobb i køen. */
export async function enqueuePowerOfficeSync(data: PowerOfficeSyncJobData): Promise<void> {
  const boss = await getProducer();
  await boss.send(POWEROFFICE_SYNC_QUEUE, data);
}

/** IN-04: legger en leverandørfaktura i videresendingskøen. */
export async function enqueuePowerOfficeInvoiceForward(data: PowerOfficeInvoiceForwardJobData): Promise<void> {
  const boss = await getProducer();
  await boss.send(POWEROFFICE_INVOICE_QUEUE, data);
}
