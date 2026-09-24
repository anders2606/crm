import { describe, expect, it } from 'vitest';

import { extractCandidateEmailAddresses, isBounceMessage } from '@/modules/campaigns/bounce';

describe('GR-07: gjenkjenning av returmelding (bounce)', () => {
  it('gjenkjenner en typisk mailer-daemon-avsender', () => {
    expect(
      isBounceMessage({
        fromAddress: 'mailer-daemon@domeneshop.no',
        fromName: null,
        subject: 'Mail delivery failed',
      }),
    ).toBe(true);
  });

  it('gjenkjenner returmelding på nøkkelord i emnet selv med ukjent avsender', () => {
    expect(
      isBounceMessage({
        fromAddress: 'noreply@example.com',
        fromName: 'Postkasse',
        subject: 'Undelivered Mail Returned to Sender',
      }),
    ).toBe(true);
  });

  it('lar en vanlig e-post fra en kunde stå uendret', () => {
    expect(
      isBounceMessage({
        fromAddress: 'ola@kunde.no',
        fromName: 'Ola Nordmann',
        subject: 'Spørsmål om tilbud',
      }),
    ).toBe(false);
  });

  it('finner e-postadresser i returmeldingens tekst', () => {
    const text = 'Delivery to the following recipient failed permanently:\n\nkunde@example.com\n\nTechnical details...';
    expect(extractCandidateEmailAddresses(text)).toEqual(['kunde@example.com']);
  });

  it('returnerer tom liste når ingen adresse finnes', () => {
    expect(extractCandidateEmailAddresses('Ingen adresse her.')).toEqual([]);
    expect(extractCandidateEmailAddresses(null)).toEqual([]);
  });
});
