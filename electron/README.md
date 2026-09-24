# Pietra Unica CRM – skrivebordsapp (M9, DR-10/DR-11)

Denne mappen inneholder Electron-appen som pakker Pietra Unica CRM som en
macOS-DMG med et kontrollpanel i menylinjen. Se `docs/kravspesifikasjon.md`
kap. 19 (M9) og `CLAUDE.md` for hvilke krav dette dekker.

**Viktig:** all koden her er skrevet og delvis testet fra en Linux-økt uten
tilgang til macOS. Se «Hva som er verifisert» og «Hva som gjenstår på en
ekte Mac» nederst før du stoler blindt på at en DMG bygget herfra fungerer.

## Arkitektur i korte trekk

- **Node følger med gratis**: Electron ER sin egen Node-kjøretid (DR-02).
  Web-serveren (Next.js sin `output: 'standalone'`-bygg) og workeren
  (bunet med esbuild, se `../scripts/build-worker.mjs`) kjøres direkte i
  Electron sin Node via `utilityProcess.fork()` – ingen separat
  Node-installasjon eller `tsx`/`ts-node` i den pakkede appen.
- **PostgreSQL følger med som binærfiler** (DR-10), IKKE som kildekode –
  se `resources/postgres/README.md` for nøyaktig hvilke filer som må
  legges der før pakking.
- **Datamappen** (`~/Library/Application Support/Pietra Unica CRM` som
  standard) inneholder database, dokumenter, logger, backup og en liten
  `config.json` – helt separat fra selve `.app`-bunten, slik at en
  oppdatering (DR-14) aldri rører dataene.

## Bygge og kjøre i utvikling

```bash
# Fra repo-roten:
npm run build                 # next build (output: standalone)
node scripts/build-worker.mjs # bunter workeren

# Fra denne mappen:
npm install
npm run build                 # kompilerer TypeScript til dist/
npm run dev                   # bygger og starter electron .
```

I utvikling finnes ikke PostgreSQL-binærene eller den kopierte
Next.js/worker-koden i Electron sin egen ressursmappe. Sett disse to
miljøvariablene til en mappe du har satt opp selv (se under) før du
kjører `npm run dev`:

```bash
export PIETRA_UNICA_DATA_DIR=/tmp/pu-dev-data
export PIETRA_UNICA_RESOURCES_DIR=/tmp/pu-dev-resources
```

`PIETRA_UNICA_RESOURCES_DIR` skal inneholde samme struktur som
`extraResources` i `package.json` legger i en pakket app:

```
<resources>/
  postgres/bin/{postgres,initdb,createdb,pg_dump,pg_restore}
  app/                     (kopi av ../.next/standalone)
  app/.next/static/        (kopi av ../.next/static)
  app/prisma/              (kopi av ../prisma, for migreringer)
  app/dist-worker/worker.js
  app/node_modules/prisma/       (Prisma CLI, for migrate deploy)
  app/node_modules/@prisma/      (client + engines, CLI-ens avhengigheter)
```

## Bygge DMG-en

```bash
npm run dist:mac
```

**Dette må kjøres PÅ en Mac** – electron-builder kan ikke lage en macOS
DMG fra Linux (`hdiutil` finnes bare på macOS). Kjør stegene i «Bygge og
kjøre i utvikling» over først (`next build`, `build-worker.mjs`), siden
`dist:mac` sin `extraResources` henter fra `../.next/standalone` osv.

DMG-en signeres bevisst ikke (`"identity": null` i `package.json`, jf.
DR-16 – «DMG-en leveres usignert»). Installasjonsveiledningen (kommer i
en senere M9-oppgave) forklarer «Åpne likevel»-varselet fra macOS.

## Hva som er verifisert (fra denne Linux-økten)

Ved å symlenke Linux sine PostgreSQL-binærer inn i en midlertidig
ressursmappe og kjøre `electron .` headless (Xvfb), er hele
oppstartskjeden bekreftet å fungere logisk riktig:

`initdb` → `postgres` starter og lytter → databasen opprettes →
backup tas → `prisma migrate deploy` kjører alle migreringer → web-
serveren starter og svarer `{"status":"ok","database":"ok"}` på
`/api/health` → workeren starter og logger normal oppstartsmelding.

Underveis fant og rettet denne verifiseringen tre reelle feil i koden
(ikke bare miljøforskjeller):

1. `unix_socket_directories` pekte til OS-standarden (som appen ikke
   nødvendigvis har skrivetilgang til) i stedet for appens egen
   datamappe.
2. `pg_dump` fikk en Prisma-tilkoblingsstreng med `?schema=`-parameteret,
   som libpq-verktøy ikke forstår – de får nå rene tilkoblingsargumenter.
3. `prisma migrate deploy` ble kjørt via `process.execPath` (Electron-
   binæren) uten `ELECTRON_RUN_AS_NODE=1`, som fikk Electron til å prøve
   å tolke Prisma CLI-en som et eget Electron-hovedscript i stedet for et
   vanlig Node-skript.

## Hva som gjenstår på en ekte Mac

- At de faktiske arm64-PostgreSQL-binærene (ikke Linux sine, som ble brukt
  i verifiseringen over) fungerer likt.
- At `npm run dist:mac` faktisk produserer en installerbar DMG.
- At launchd-registreringen (kommer i en senere M9-oppgave) faktisk
  starter tjenestene ved oppstart og restarter dem ved krasj (DR-12).
- At macOS sin nøkkelring faktisk lagrer/henter hemmeligheter riktig
  (DR-08, egen M9-oppgave).
- Selve DR-16-akseptansekriteriet: at en ny Mac uten annen programvare kan
  installere og kjøre DMG-en.
- Et ekte menylinje-ikon (`resources/trayTemplate.png` er i dag en
  1×1-plassholder, se kommentaren i `src/tray.ts`).
