import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalDiskStorage } from '@/lib/storage';

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('lokal fillagring bak lagringsgrensesnittet (DO-08)', () => {
  let baseDir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'pu-storage-'));
    storage = new LocalDiskStorage(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('lagrer og leser tilbake samme innhold', async () => {
    const content = Buffer.from('innholdet i et testdokument');
    await storage.put('kunder/abc/tegning.pdf', content);

    const readBack = await streamToBuffer(await storage.read('kunder/abc/tegning.pdf'));
    expect(readBack.equals(content)).toBe(true);
  });

  it('sletter en lagret fil', async () => {
    await storage.put('fil.txt', Buffer.from('data'));
    await storage.delete('fil.txt');

    await expect(storage.read('fil.txt')).rejects.toThrow();
  });

  it('nekter å lese/skrive utenfor lagringsmappen (path traversal)', async () => {
    await expect(storage.put('../uonsket.txt', Buffer.from('x'))).rejects.toThrow(
      'Ugyldig lagringsnøkkel',
    );
    const outside = await readdir(path.dirname(baseDir));
    expect(outside).not.toContain('uonsket.txt');
  });
});
