// Egen bakgrunnsprosess (kap. 15/20, arbeidsregel 12): all IMAP/SMTP-trafikk
// skjer herfra, aldri direkte i en brukerforespørsel. Kjøres ved siden av
// Next.js-appen: `npm run worker`.
//
// To mekanismer, som beskrevet i kap. 18:
// 1. Periodisk synk (pg-boss, hvert minutt) – alltid aktiv, «reserve»-
//    mekanismen som garanterer at M3s akseptansekriterium («innen 2
//    minutter») holdes uansett.
// 2. IMAP IDLE – nær sanntid, kun mot ekte kontoer (MAIL_INTEGRATION_MODE=real).
try {
  process.loadEnvFile();
} catch {
  // Ingen .env til stede – variablene må da allerede være satt i prosessmiljøet.
}

import { PgBoss } from 'pg-boss';

import { getMailClient } from '@/integrations/mail';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/secrets';
import { syncAccountFolder } from '@/modules/email/sync';

const SYNC_QUEUE = 'email-sync-all-accounts';
const FOLDERS = ['INBOX', 'Sent'];

async function syncAllAccounts(): Promise<void> {
  const accounts = await prisma.emailAccount.findMany({ where: { active: true } });

  for (const account of accounts) {
    for (const folder of FOLDERS) {
      try {
        const count = await syncAccountFolder(account, folder);
        if (count > 0) {
          console.log(`[worker] ${account.address} (${folder}): ${count} nye melding(er)`);
        }
      } catch (error) {
        console.error(`[worker] Synk feilet for ${account.address} (${folder}):`, error);
      }
    }
  }
}

const idleStoppers = new Map<string, () => Promise<void>>();

async function startIdleWatchers(): Promise<void> {
  if (process.env.MAIL_INTEGRATION_MODE !== 'real') {
    return; // IDLE gir ingen mening mot mock-klienten i utvikling/tester.
  }

  const client = getMailClient();
  const accounts = await prisma.emailAccount.findMany({ where: { active: true } });

  for (const account of accounts) {
    if (idleStoppers.has(account.id)) {
      continue;
    }
    try {
      const stop = await client.watch(
        {
          address: account.address,
          username: account.username,
          password: decryptSecret(account.encryptedPassword),
          imapHost: account.imapHost,
          imapPort: account.imapPort,
          smtpHost: account.smtpHost,
          smtpPort: account.smtpPort,
        },
        'INBOX',
        () => {
          syncAccountFolder(account, 'INBOX').catch((error) => {
            console.error(`[worker] IDLE-utløst synk feilet for ${account.address}:`, error);
          });
        },
      );
      idleStoppers.set(account.id, stop);
      console.log(`[worker] IMAP IDLE aktiv for ${account.address}`);
    } catch (error) {
      console.warn(
        `[worker] Klarte ikke starte IMAP IDLE for ${account.address} – faller tilbake til periodisk synk:`,
        error,
      );
    }
  }
}

async function stopIdleWatchers(): Promise<void> {
  for (const stop of idleStoppers.values()) {
    await stop().catch(() => undefined);
  }
  idleStoppers.clear();
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL mangler i miljøvariabler (.env)');
  }

  const boss = new PgBoss(databaseUrl);
  boss.on('error', (error: Error) => console.error('[worker] pg-boss-feil:', error));
  await boss.start();
  await boss.createQueue(SYNC_QUEUE); // idempotent – trygt å kalle ved hver oppstart

  await boss.work(SYNC_QUEUE, async () => {
    await syncAllAccounts();
  });

  // Minuttoppløsning er nok til å holde M3s 2-minutters akseptansekriterium
  // med god margin, og krever ingen ekstra avhengighet utover pg-boss.
  await boss.schedule(SYNC_QUEUE, '* * * * *', null, { tz: 'Europe/Oslo' });

  console.log('[worker] Startet. Periodisk e-postsynk hvert minutt.');

  // DR-04: hent inn det som er gått glipp av umiddelbart ved oppstart,
  // ikke vent på første planlagte kjøring.
  await syncAllAccounts();
  await startIdleWatchers();

  const shutdown = async () => {
    console.log('[worker] Avslutter …');
    await stopIdleWatchers();
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[worker] Klarte ikke starte:', error);
  process.exitCode = 1;
});
