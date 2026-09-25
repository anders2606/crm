// DR-07: hindrer at to installasjoner (f.eks. en bærbar Mac i lokal modus
// og Mac mini-en i servermodus) kjører mot samme datamappe samtidig – noe
// som ville gitt to PostgreSQL-instanser som skriver til de samme
// datafilene, med korrupsjon som sannsynlig resultat. Dette er noe annet
// enn Electron sin `requestSingleInstanceLock()` i main.ts, som kun
// hindrer at NØYAKTIG samme app-binær startes to ganger på samme maskin –
// denne låsen er knyttet til selve datamappen, uavhengig av hvilken
// installasjon som bruker den.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

import { getLockFilePath } from '../paths';

interface LockInfo {
  pid: number;
  hostname: string;
  startedAt: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 sender ikke noe faktisk signal – kaster bare hvis
    // prosessen ikke finnes.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM betyr at prosessen finnes, men eies av en annen bruker – den
    // er uansett i live.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readLockInfo(lockPath: string): LockInfo | null {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo;
  } catch {
    return null;
  }
}

/**
 * Sjekker og tar låsen for denne datamappen. Kaster med en brukervennlig
 * feilmelding hvis en annen installasjon ser ut til å kjøre mot den
 * allerede.
 *
 * En foreldet lås fra ET KRASJ PÅ DENNE MASKINEN (samme hostname, men
 * prosessen kjører ikke lenger) ryddes automatisk opp i og overtas. En lås
 * som peker til en ANNEN maskin kan ikke verifiseres (vi har ingen måte å
 * sjekke om den prosessen faktisk lever), så den avvises alltid – brukeren
 * må da selv bekrefte at den andre installasjonen faktisk er stoppet og
 * fjerne låsfilen manuelt.
 */
export function acquireInstanceLock(): void {
  const lockPath = getLockFilePath();
  // Datamappen finnes kanskje ikke ennå ved aller første oppstart (før
  // veiviseren har startet PostgreSQL, som ellers er det som oppretter den).
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const existing = existsSync(lockPath) ? readLockInfo(lockPath) : null;

  if (existing) {
    if (existing.pid === process.pid && existing.hostname === hostname()) {
      // Denne prosessen tok allerede låsen selv (f.eks. et mislykket
      // oppstartsforsøk fra tjenestepanelet ble prøvd på nytt) – ikke avvis
      // seg selv, bare skriv en fersk tidsstempel.
      writeFileSync(lockPath, JSON.stringify({ ...existing, startedAt: new Date().toISOString() }, null, 2), 'utf8');
      return;
    }

    const sameMachine = existing.hostname === hostname();
    if (!sameMachine) {
      throw new Error(
        `Datamappen ser ut til å være i bruk av en annen installasjon (${existing.hostname}, startet ${existing.startedAt}). ` +
          'Stopp den andre installasjonen først. Hvis du er sikker på at den allerede er stoppet, ' +
          `kan du fjerne låsfilen manuelt: ${lockPath}`,
      );
    }
    if (isProcessAlive(existing.pid)) {
      throw new Error(
        `Pietra Unica CRM kjører allerede mot denne datamappen (prosess ${existing.pid} på denne maskinen).`,
      );
    }
    // Samme maskin, men prosessen kjører ikke lenger – foreldet lås etter
    // et krasj eller en tvungen avslutning. Trygt å overta.
  }

  const info: LockInfo = { pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() };
  writeFileSync(lockPath, JSON.stringify(info, null, 2), 'utf8');
}

/** Kalles ved normal avslutning – trygt å kalle selv om låsen ikke ble tatt. */
export function releaseInstanceLock(): void {
  try {
    unlinkSync(getLockFilePath());
  } catch {
    // Allerede borte – greit.
  }
}
