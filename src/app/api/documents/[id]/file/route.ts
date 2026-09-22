// DO-03: forhåndsvisning av PDF/bilder direkte i systemet, uten nedlasting
// (Content-Disposition: inline). Rettigheter følger entiteten dokumentet er
// koblet til (kunde/leverandør), aldri kun sjekket i grensesnittet.
import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/rbac/permissions';
import { getStorage, readToBuffer } from '@/lib/storage';
import { getReadPermissionForEntityType } from '@/modules/documents/service';

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
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
  const buffer = await readToBuffer(stream);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Length': String(document.sizeBytes),
      'Content-Disposition': contentDisposition(document.fileName),
      'Cache-Control': 'private, no-store',
    },
  });
}
