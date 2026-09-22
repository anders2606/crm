// DO-03: forhåndsvisning av PDF/bilder direkte i systemet, uten nedlasting
// (Content-Disposition: inline). Rettigheter følger entiteten dokumentet er
// koblet til (kunde/leverandør), aldri kun sjekket i grensesnittet.
import type { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/rbac/permissions';
import { getStorage } from '@/lib/storage';
import { getReadPermissionForEntityType } from '@/modules/documents/service';

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// Node sin fs.ReadStream -> Web ReadableStream-adapter kaster en ubehandlet
// feil ("Controller is already closed") når mottakeren (f.eks. nettleserens
// PDF-forhåndsvisning) avbryter lesingen før strømmen er ferdig. Dokumentene
// her er ikke store nok (typisk opp mot noen hundre MB) til at buffret
// lesing er et reelt problem, så vi leser hele filen først i stedet.
function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  }

  const document = await prisma.document.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!document) {
    return NextResponse.json({ error: 'Ikke funnet' }, { status: 404 });
  }

  if (!hasPermission(session, getReadPermissionForEntityType(document.entityType))) {
    return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });
  }

  const stream = await getStorage().read(document.storageKey);
  const buffer = await readStreamToBuffer(stream);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Length': String(document.sizeBytes),
      'Content-Disposition': contentDisposition(document.fileName),
      'Cache-Control': 'private, no-store',
    },
  });
}
