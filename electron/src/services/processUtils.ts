// Delt hjelpefunksjon for eksterne binærer (initdb/pg_dump/tar/cp/Prisma
// CLI-en) kjørt synkront under oppstart/backup/eksport. Kjøres i en pakket
// app uten synlig terminal, så den tidligere `stdio: 'inherit'`-varianten
// (brukt several steder her) sendte all diagnostikk et sted brukeren aldri
// ser den – et reelt problem oppdaget da eier fikk en bar «avslutningskode
// null» fra initdb uten noen forklaring, fordi macOS stanset den FØR den i
// det hele tatt rakk å starte (se electron-builder sin afterPack-hook,
// scripts/afterPack.js, som ad-hoc-signerer de medfølgende binærene av
// nøyaktig denne grunnen – et resultat på `null` her betyr typisk at
// spawnSync enten aldri klarte å starte prosessen, eller at den ble drept av
// et signal, IKKE et vanlig program-exit-kode).
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

export function runOrThrow(binary: string, args: string[], failureLabel: string, options: SpawnSyncOptions = {}): void {
  const result = spawnSync(binary, args, { ...options, stdio: 'pipe' });

  const output = [result.stdout?.toString().trim(), result.stderr?.toString().trim()].filter(Boolean).join('\n');

  if (result.error) {
    throw new Error(`${failureLabel} kunne ikke startes (${result.error.message}).${output ? `\n${output}` : ''}`);
  }
  if (result.signal) {
    // SIGABRT her betyr som regel at dyld selv avbrøt lastingen (f.eks. et
    // manglende eller usignert delt bibliotek en binærfil er lenket mot),
    // IKKE nødvendigvis at selve hovedbinæren ble nektet kjørt – stderr
    // under (hvis noe) inneholder normalt den faktiske dyld-feilmeldingen.
    throw new Error(
      `${failureLabel} ble stanset av systemet (signal ${result.signal}) – macOS kan ha nektet å kjøre en usignert binærfil eller et usignert/manglende bibliotek den er avhengig av.${output ? `\n${output}` : ''}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`${failureLabel} feilet med avslutningskode ${result.status}${output ? `:\n${output}` : ''}`);
  }
}
