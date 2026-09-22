// DO-08: fillagring bak et grensesnitt, slik at lagringsstedet kan utvides
// (f.eks. S3) uten kodeendring i resten av systemet (kap. 15). Kun lokal
// disk er implementert nå.
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

export interface StorageBackend {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

export class LocalDiskStorage implements StorageBackend {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const resolved = path.resolve(this.baseDir, key);
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new Error('Ugyldig lagringsnøkkel');
    }
    return resolved;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async read(key: string): Promise<Readable> {
    const filePath = this.resolve(key);
    await stat(filePath); // kaster hvis filen ikke finnes
    return createReadStream(filePath);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

let backend: StorageBackend | undefined;

export function getStorage(): StorageBackend {
  if (!backend) {
    const baseDir = process.env.STORAGE_DIR ?? path.join(process.cwd(), 'data', 'documents');
    backend = new LocalDiskStorage(baseDir);
  }
  return backend;
}

// Node sin fs.ReadStream -> Web ReadableStream-adapter kaster en ubehandlet
// feil ("Controller is already closed") når mottakeren avbryter lesingen før
// strømmen er ferdig (f.eks. nettleserens PDF-forhåndsvisning). Filene her er
// ikke store nok til at buffret lesing er et reelt problem, så vi leser hele
// filen først i stedet – både ved visning (DO-03) og e-postvedlegg (IN-04).
export function readToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
