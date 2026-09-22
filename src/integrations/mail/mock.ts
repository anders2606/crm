// Mock-variant av e-postintegrasjonen (kap. 15/18 krever mock for alle
// integrasjoner). Brukes i alle automatiske tester og som standard i
// utvikling, slik at ingen tester eller vanlig lokal kjøring rører ekte
// postbokser (arbeidsregel 5).
import type { MailClient, OutgoingMessage, ParsedIncomingMessage } from './types';

const inbox = new Map<string, ParsedIncomingMessage[]>();
const sentLog: Array<{ address: string; message: OutgoingMessage }> = [];

function key(address: string, folder: string): string {
  return `${address}:${folder}`;
}

export function seedMockMailbox(address: string, folder: string, messages: ParsedIncomingMessage[]): void {
  inbox.set(key(address, folder), messages);
}

export function getMockSentLog(): Array<{ address: string; message: OutgoingMessage }> {
  return sentLog;
}

export function resetMockMail(): void {
  inbox.clear();
  sentLog.length = 0;
}

export const mockMailClient: MailClient = {
  async fetchNewMessages(account, folder, sinceUid) {
    const all = inbox.get(key(account.address, folder)) ?? [];
    return all.filter((message) => message.uid > sinceUid);
  },

  async watch() {
    // Mock-kontoer overvåkes ikke i sanntid – testene kaller fetchNewMessages direkte.
    return async () => {};
  },

  async sendAndArchive(account, message) {
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2)}@mock`;
    sentLog.push({ address: account.address, message });
    return { messageId };
  },
};
