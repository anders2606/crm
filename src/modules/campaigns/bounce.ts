// GR-07: heuristikk for å gjenkjenne en automatisk returmelding (bounce) om
// permanent levering feilet. Ekte DSN-parsing (RFC 3464, strukturerte
// Final-Recipient/Action-felt) er ikke bygget – i stedet ser vi på
// avsenderadresse/-navn og nøkkelord i emnet, samme «enkelt og synlig for
// manuell oppfølging»-tilnærming som bankfilimportens matching (M7).
const BOUNCE_SENDER_PATTERNS = [/mailer-daemon/i, /postmaster/i, /mail delivery subsystem/i];
const BOUNCE_SUBJECT_PATTERNS = [
  /undelivered/i,
  /undeliverable/i,
  /delivery status notification/i,
  /delivery has failed/i,
  /mail delivery failed/i,
  /returned to sender/i,
  /kunne ikke leveres/i,
  /levering (av meldingen )?feilet/i,
];

export function isBounceMessage(message: {
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
}): boolean {
  const sender = `${message.fromAddress} ${message.fromName ?? ''}`;
  if (BOUNCE_SENDER_PATTERNS.some((pattern) => pattern.test(sender))) {
    return true;
  }
  return BOUNCE_SUBJECT_PATTERNS.some((pattern) => pattern.test(message.subject ?? ''));
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Finner e-postadresser nevnt i returmeldingens tekst – den opprinnelige
 * mottakeradressen står normalt her (f.eks. «Final-Recipient: ...» eller i
 * fritekstforklaringen), selv om vi ikke tolker meldingen strukturert.
 */
export function extractCandidateEmailAddresses(text: string | null): string[] {
  if (!text) {
    return [];
  }
  return [...new Set(text.match(EMAIL_PATTERN) ?? [])];
}
