// IF-06: helsesjekk-endepunkt for driftsdashbord og varsling ved nedetid.
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        error: error instanceof Error ? error.message : 'ukjent feil',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
