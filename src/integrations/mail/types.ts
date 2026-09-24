// Felles grensesnitt for e-postintegrasjonen (kap. 15/18, arbeidsregel 12:
// eksterne systemer kun fra workeren). Én implementasjon her (mock.ts) brukes
// i tester og lokal utvikling; real.ts snakker med det faktiske IMAP/SMTP-serverne.
export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface ParsedIncomingMessage {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  textBody: string | null;
  occurredAt: Date;
  attachments: MailAttachment[];
}

export interface MailAccountCredentials {
  address: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export interface OutgoingMessage {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
  /** GR-03: brukes til List-Unsubscribe-header på kampanje-e-post. */
  headers?: Record<string, string>;
}

export interface MailClient {
  /** Henter meldinger i en mappe med UID > sinceUid (periodisk synk, kap. 18). */
  fetchNewMessages(
    account: MailAccountCredentials,
    folder: string,
    sinceUid: number,
  ): Promise<ParsedIncomingMessage[]>;

  /**
   * IMAP IDLE: kaller onNewMail() når mappen endres. Returnerer en funksjon
   * som stopper lyttingen.
   */
  watch(
    account: MailAccountCredentials,
    folder: string,
    onNewMail: () => void,
  ): Promise<() => Promise<void>>;

  /** Sender en e-post og arkiverer nøyaktig samme MIME-kilde i Sendt-mappen (EP-08). */
  sendAndArchive(account: MailAccountCredentials, message: OutgoingMessage): Promise<{ messageId: string }>;
}
