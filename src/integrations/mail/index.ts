// Fabrikk som velger mock (standard) eller ekte IMAP/SMTP-klient. Kun
// workeren setter MAIL_INTEGRATION_MODE=real (arbeidsregel 5/12).
import { mockMailClient } from './mock';
import { realMailClient } from './real';
import type { MailClient } from './types';

export * from './types';
export { getMockSentLog, mockMailClient, resetMockMail, seedMockMailbox } from './mock';

export function getMailClient(): MailClient {
  return process.env.MAIL_INTEGRATION_MODE === 'real' ? realMailClient : mockMailClient;
}
