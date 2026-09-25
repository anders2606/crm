'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const path = require('node:path');

// DR-10: PostgreSQL-binærene som følger med appen (initdb/postgres/createdb/
// pg_dump/pg_restore, se resources/postgres/README.md) er IKKE signert av
// EDB. macOS nekter å kjøre en helt usignert binærfil i det hele tatt når
// den startes programmatisk (via spawn), selv etter at brukeren har godkjent
// «Åpne likevel» for selve .app-pakken – det unntaket dekker kun selve
// LaunchServices-oppstarten av .app-en, ikke løse binærfiler den senere
// kjører internt. Uten dette feilet initdb med en bar «avslutningskode
// null» og ingen forklaring (ekte feil oppdaget av eier på en Intel-Mac, se
// electron/README.md) – «null» er nettopp signaturen på at spawnSync aldri
// fikk startet prosessen i det hele tatt.
//
// En ad-hoc-signatur (`--sign -`, ingen ekte sertifikat) er nok til at
// macOS godtar å kjøre dem – appen er uansett allerede bevisst usignert i
// sin helhet (DR-16, "identity": null i package.json).
module.exports = async function afterPack(context) {
  // `codesign` selv finnes kun på macOS - uansett hvilken plattform pakken
  // BYGGES FOR (context.electronPlatformName), kan signering bare skje når
  // dette faktisk KJØRER på en Mac. Gjør denne hooken trygg å ha innom under
  // et lokalt Linux-testbygg av "--mac dir" (se electron/README.md), som
  // ellers ville krasjet på et manglende codesign-program.
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const binDir = path.join(context.appOutDir, appName, 'Contents', 'Resources', 'postgres', 'bin');
  if (!existsSync(binDir)) {
    return;
  }

  for (const fileName of readdirSync(binDir)) {
    const binPath = path.join(binDir, fileName);
    execFileSync('codesign', ['--force', '--sign', '-', binPath]);
    console.log(`[afterPack] Ad-hoc-signerte ${fileName}`);
  }
};
