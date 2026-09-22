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
