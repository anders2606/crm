'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

// DR-10: PostgreSQL-binærene som følger med appen (initdb/postgres/createdb/
// pg_dump/pg_restore, se resources/postgres/README.md) er IKKE signert av
// EDB, og er dynamisk lenket mot delte biblioteker (libpq/libssl/libicu osv.,
// se `otool -L` i .github/workflows/build-dmg.yml) som ligger i en sidestilt
// resources/postgres/lib/. macOS nekter å kjøre EN usignert binærfil i det
// hele tatt når den startes programmatisk (via spawn), selv etter at
// brukeren har godkjent «Åpne likevel» for selve .app-pakken – det unntaket
// dekker kun selve LaunchServices-oppstarten av .app-en, ikke løse
// binærfiler/biblioteker den senere laster/kjører internt.
//
// To ekte feil funnet av eier på en Intel-Mac, i to omganger:
// 1. En bar «avslutningskode null» – spawnSync fikk aldri startet initdb i
//    det hele tatt. Rettet ved å ad-hoc-signere binærene i postgres/bin/.
// 2. Deretter «stanset av signal SIGABRT» – dyld sin egen reaksjon på at
//    initdb (nå signert) fortsatt ikke fant/fikk laste sine usignerte
//    delte biblioteker. Rettet ved å ad-hoc-signere postgres/lib/ også.
//
// En ad-hoc-signatur (`--sign -`, ingen ekte sertifikat) er nok til at
// macOS godtar å kjøre/laste dem – appen er uansett allerede bevisst
// usignert i sin helhet (DR-16, "identity": null i package.json).
module.exports = async function afterPack(context) {
  // `codesign` selv finnes kun på macOS - uansett hvilken plattform pakken
  // BYGGES FOR (context.electronPlatformName), kan signering bare skje når
  // dette faktisk KJØRER på en Mac. Gjør denne hooken trygg å ha innom under
  // et lokalt Linux-testbygg av "--mac dir" (se electron/README.md), som
  // ellers ville krasjet på et manglende codesign-program.
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') {
    return;
  }

  const resourcesDir = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources');
  signAllFilesIn(path.join(resourcesDir, 'postgres', 'bin'));
  signAllFilesIn(path.join(resourcesDir, 'postgres', 'lib'));
};

function signAllFilesIn(dir) {
  if (!existsSync(dir)) {
    return;
  }
  for (const fileName of readdirSync(dir)) {
    const filePath = path.join(dir, fileName);
    if (statSync(filePath).isDirectory()) {
      signAllFilesIn(filePath);
      continue;
    }
    try {
      execFileSync('codesign', ['--force', '--sign', '-', filePath]);
      console.log(`[afterPack] Ad-hoc-signerte ${filePath}`);
    } catch (error) {
      // Kan være en symlink til en fil vi allerede signerte (vanlig for
      // versjonerte .dylib-navn, f.eks. libpq.dylib -> libpq.5.dylib), eller
      // en fil som ikke er en Mach-O-binærfil i det hele tatt - ikke la det
      // stanse resten av pakkingen, men si ifra tydelig i loggen.
      console.warn(`[afterPack] Kunne ikke signere ${filePath}: ${error.message}`);
    }
  }
}
