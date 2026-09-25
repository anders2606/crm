'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

// DR-10: en rekke usignerte, tredjeparts native binærfiler følger med appen
// (PostgreSQL sine bin/lib-filer, Prisma sin schema-engine og
// query-engine-.node-filer m.fl.). macOS nekter å kjøre/laste EN usignert
// binærfil i det hele tatt, programmatisk (via spawn/dlopen), selv etter at
// brukeren har godkjent «Åpne likevel» for selve .app-pakken – det unntaket
// dekker kun selve LaunchServices-oppstarten av .app-en, ikke løse
// binærfiler/biblioteker den senere laster/kjører internt.
//
// Denne hooken fant opprinnelig KUN postgres/bin/+postgres/lib/ (to separate
// runder, se electron/README.md for den fulle rekken av ekte feil eier
// støtte på: bar «avslutningskode null» → «signal SIGABRT» → manglende
// postgres.bki). Generalisert til å signere HELE .app-bunten etter at
// akkurat samme feilmønster dukket opp en fjerde gang for en HELT ANNEN
// binærfil (Prisma sin `schema-engine-darwin`, brukt av `prisma migrate
// deploy` - "Could not find schema-engine binary") - fremfor å fortsette å
// hviske inn ett spesialtilfelle om gangen, signeres nå alt som SER UT som
// en native binærfil/bibliotek uansett hvor i bunten den ligger, slik at en
// fremtidig, ennå ukjent tilsvarende avhengighet ikke krever enda en runde.
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
  signNativeBinariesIn(resourcesDir);
};

/** Filnavn som med stor sannsynlighet er en native binærfil/bibliotek, ikke bare tekst/JS/JSON. */
function looksLikeNativeBinary(fileName, stat) {
  if (/\.(dylib|so|node)$/.test(fileName)) {
    return true;
  }
  // CLI-verktøy som postgres/initdb og Prisma sin schema-engine-darwin har
  // ingen filendelse i det hele tatt - kombinert med kjøretillatelse er
  // dette et pålitelig tegn på en binærfil (fremfor f.eks. README/LICENSE,
  // som heller ikke har noen filendelse, men aldri er kjørbare).
  const hasExtension = path.extname(fileName) !== '';
  const isExecutable = (stat.mode & 0o111) !== 0;
  return !hasExtension && isExecutable;
}

function signNativeBinariesIn(dir) {
  if (!existsSync(dir)) {
    return;
  }
  for (const fileName of readdirSync(dir)) {
    const filePath = path.join(dir, fileName);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      signNativeBinariesIn(filePath);
      continue;
    }
    if (!looksLikeNativeBinary(fileName, stat)) {
      continue;
    }
    try {
      execFileSync('codesign', ['--force', '--sign', '-', filePath]);
      console.log(`[afterPack] Ad-hoc-signerte ${filePath}`);
    } catch (error) {
      // Kan være en symlink til en fil vi allerede signerte (vanlig for
      // versjonerte .dylib-navn, f.eks. libpq.dylib -> libpq.5.dylib), eller
      // en kjørbar tekstfil (f.eks. et shell-skript) som traff heuristikken
      // over uten å faktisk være en Mach-O-binærfil - ikke la det stanse
      // resten av pakkingen, men si ifra tydelig i loggen.
      console.warn(`[afterPack] Kunne ikke signere ${filePath}: ${error.message}`);
    }
  }
}
