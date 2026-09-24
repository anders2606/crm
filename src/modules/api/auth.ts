// GE-11: felles autentisering for det åpne REST-API-et (arbeidsregel 12
// gjelder ikke her – dette er ikke et kall TIL et eksternt system, men et
// grensesnitt eksterne systemer kaller INN mot).
import type { ApiKey } from '@prisma/client';
import { NextResponse } from 'next/server';

import { verifyApiKey } from '@/lib/api-keys';

export type ApiAuthResult = { apiKey: ApiKey; error?: undefined } | { apiKey?: undefined; error: NextResponse };

export async function requireApiScope(request: Request, scope: string): Promise<ApiAuthResult> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) {
    return {
      error: NextResponse.json({ error: 'Mangler API-nøkkel (Authorization: Bearer <nøkkel>)' }, { status: 401 }),
    };
  }

  const apiKey = await verifyApiKey(match[1]!);
  if (!apiKey) {
    return { error: NextResponse.json({ error: 'Ugyldig eller inaktiv API-nøkkel' }, { status: 401 }) };
  }
  if (!apiKey.scopes.includes(scope)) {
    return { error: NextResponse.json({ error: 'API-nøkkelen mangler nødvendig tilgang' }, { status: 403 }) };
  }

  return { apiKey };
}
