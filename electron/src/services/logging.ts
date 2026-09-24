// DR-11: kontrollpanelets «vis logger»-knapp åpner denne mappen. All
// utdata fra web-serveren og workeren skrives hit, siden utilityProcess
// sin stdout/stderr ellers ikke havner noe sted en bruker kan se dem.
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import path from 'node:path';

import type { UtilityProcess } from 'electron';

import { getLogsDir } from '../paths';

export function attachProcessLog(processName: string, child: UtilityProcess): void {
  mkdirSync(getLogsDir(), { recursive: true });
  const stream: WriteStream = createWriteStream(path.join(getLogsDir(), `${processName}.log`), { flags: 'a' });

  child.stdout?.on('data', (chunk: Buffer) => stream.write(chunk));
  child.stderr?.on('data', (chunk: Buffer) => stream.write(chunk));
  child.on('exit', (code) => {
    stream.write(`\n[${new Date().toISOString()}] ${processName} avsluttet med kode ${code}\n`);
    stream.end();
  });
}
