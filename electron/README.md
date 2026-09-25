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

Appen leveres som to SEPARATE DMG-er (DR-10) – én for Apple Silicon og én
for Intel, siden de medfølgende PostgreSQL-binærene er
arkitekturspesifikke (se `resources/postgres/README.md` for hvordan du
bytter dem mellom de to byggene):

```bash
npm run dist:mac:arm64   # Apple Silicon
npm run dist:mac:x64     # Intel
```

**Dette må kjøres PÅ en Mac** – electron-builder kan ikke lage en macOS
DMG fra Linux (`hdiutil` finnes bare på macOS). Kjør stegene i «Bygge og
kjøre i utvikling» over først (`next build`, `build-worker.mjs`), siden
`dist:mac:*` sin `extraResources` henter fra `../.next/standalone` osv.
`.github/workflows/build-dmg.yml` bygger begge automatisk via GitHub
Actions – se «DMG-bygging i GitHub Actions» lenger ned for hva som
faktisk er verifisert der.

DMG-en signeres bevisst ikke (`"identity": null` i `package.json`, jf.
DR-16 – «DMG-en leveres usignert»). Se `docs/mac-mini-oppsett.md` for
hvordan «Åpne likevel»-varselet fra macOS godkjennes.

**Bekreftet i praksis** (ikke bare antatt): `npm run dist:mac` ble faktisk
forsøkt kjørt fra denne Linux-økten, og feiler slik forventet – `dmg-
builder` (electron-builder sin DMG-pakker) krever ubetinget `dmg-license`,
som er markert `"os": ["darwin"]` i sin egen `package.json` og derfor
aldri installeres på Linux. Det er altså IKKE bare `hdiutil` som mangler –
selve avhengighetstreet til DMG-formatet nekter å laste i det hele tatt
utenfor macOS.

For likevel å sannsynliggjøre at selve INNPAKKINGEN (`extraResources`,
`files`, appId osv. i `package.json`) er riktig satt opp, ble
`npx electron-builder --mac dir --arm64` kjørt i stedet (target `dir`
hopper over selve DMG-steget og lager kun en upakket `.app`, som IKKE
krever `dmg-license`). Dette lyktes og avdekket en reell, alvorlig feil:

**Oppdaget og rettet feil: utviklerens lokale `./data`-mappe ble bakt inn
i bygget.** Next.js sin `output: 'standalone'`-filsporing evaluerer
`process.cwd()`-baserte stier i `src/lib/storage.ts`/`src/lib/backup.ts`
ved BYGGETIDSPUNKTET (da er cwd repo-roten), og tok da med alt som lå i
`./data/documents` og `./data/backups` PÅ DEN MASKINEN BYGGET KJØRTE PÅ –
i dette tilfellet denne øktens egne test-backup og test-dokumenter, men
prinsippet er identisk for en utvikler med ekte kundedata liggende lokalt.
Uten fiksen ville ALT som tilfeldigvis lå i `./data` blitt distribuert i
DMG-en, uavhengig av `STORAGE_DIR`/`BACKUP_DIR` (som appen alltid setter
til den ekte datamappen ved kjøring, se `paths.ts` – den pakkede `./data`
leses aldri, den bare lekker). Rettet med `outputFileTracingExcludes` i
`next.config.mjs` (utelater `./data/**/*` fra selve sporingen, roten til
problemet) og, som ekstra sikkerhetsnett, samme `filter`-mønster som
`.env*` allerede brukte i `extraResources` her i `package.json`. Bekreftet
rettet: et nytt `--mac dir --arm64`-bygg inneholder verken `data/` eller
`.env*` i `Contents/Resources/`.

## DMG-bygging i GitHub Actions – hva som er verifisert

`.github/workflows/build-dmg.yml` (manuell, `workflow_dispatch`) bygger
begge DMG-ene på en ekte macOS-runner, siden det er det eneste stedet i
denne utviklingsøkten en ekte DMG faktisk kan lages. Kjørt for reelt flere
ganger, og fant tre reelle feil utover de over – alle rettet og bekreftet
med en påfølgende grønn kjøring:

1. **Rekkefølgefeil, ikke en kodefeil:** første kjøring feilet i
   typecheck-steget fordi rotens tsconfig sin `**/*.ts` fanger opp
   `electron/src` også, og `electron/node_modules` (som har `electron`
   sine egne typedeklarasjoner) ikke var installert ennå på det
   tidspunktet i workflowen. Rettet ved å installere `electron/` sine
   avhengigheter FØR typecheck-steget.
2. **`@prisma/client`-kollisjon i selve pakkingen:** `EEXIST: file already
   exists, link .../node_modules/@prisma/client/default.js`. To
   `extraResources`-oppføringer kopierte begge inn `@prisma/client` til
   samme sted – den sporede `.next/standalone` (som Next.js allerede tar
   med) OG en eksplisitt `../node_modules/@prisma`-oppføring (der for at
   den bundlede Prisma CLI-en skal ha sine egne `@prisma/engines` osv.).
   Kolliderte kun på macOS sin hardlink-baserte filkopiering (`builder-
   util`), IKKE på Linux sin vanlige kopiering – derfor ikke fanget opp av
   det tidligere `--mac dir`-testbygget. Rettet ved å ekskludere `client`
   fra den eksplisitte `@prisma`-kopien, siden `.next/standalone` sin
   sporede kopi allerede er den appen faktisk bruker.
3. **arm64-DMG-en kjørte ikke på en Intel-Mac** (oppdaget av eier selv, på
   en ekte mid-2020 MacBook Air – IKKE noe headless testing i denne økten
   kunne ha fanget opp, siden det krever ekte Intel-maskinvare). To
   separate ting måtte rettes:
   - `prisma/schema.prisma` sin `binaryTargets` inneholdt kun `native` og
     `darwin-arm64` – ALDRI `darwin` (Intel). `@prisma/client` sin
     spørremotor mangler dermed helt på en Intel-Mac, uavhengig av om
     PostgreSQL-binærene i seg selv var riktige. Rettet ved å legge til
     `darwin` i `binaryTargets`.
   - Selve DR-10-kravet ble endret (etter eiers eksplisitte beslutning,
     se `docs/kravspesifikasjon.md`) fra kun arm64 til å dekke BEGGE
     arkitekturene permanent. `dist:mac` delt i `dist:mac:arm64`/
     `dist:mac:x64`, og workflowen bygger nå begge i to omganger (samme
     `.next/standalone`, som inneholder alle tre Prisma-motorene uansett,
     men arkitekturspesifikke PostgreSQL-binærer hentet og
     `lipo`-verifisert rett før hver av dem).

**Oppdatering:** `lipo -archs`-sjekken i workflowen bekreftet at EDB sin
nedlasting faktisk er en universal (fat) binær – `postgres-binæren
inneholder: x86_64 arm64` ble logget i den første kjøringen som bygget
begge arkitekturene. Samme nedlasting brukes altså trygt til begge DMG-ene,
ikke bare antatt.

## Kjøring på ekte Mac-maskinvare – funn og retting

Eier testet x64-DMG-en på en ekte mid-2020 MacBook Air (Intel) – den første
faktiske kjøringen av NOE fra M9 på ekte Mac-maskinvare i dette prosjektet.
Installasjonsveiviseren startet (Gatekeeper-godkjenningen fungerte), men
feilet med en uforklart `initdb feilet med avslutningskode null`.

**Rotårsak:** et resultat på `null` fra Node sin `spawnSync` betyr at
prosessen ALDRI ble fullført normalt – enten klarte den aldri å starte i
det hele tatt, eller den ble drept av et signal. De medfølgende PostgreSQL-
binærene (`initdb`/`postgres`/`createdb`/`pg_dump`/`pg_restore`, fra EDB)
er helt usignerte. macOS nekter å kjøre en usignert binærfil i det hele
tatt når den startes programmatisk via `spawn()` – og «Åpne likevel»-
godkjenningen brukeren gir for selve `.app`-pakken (DR-16) dekker KUN
LaunchServices sin oppstart av selve appen, ikke løse binærfiler appen
senere kjører internt.

**Rettet på to nivåer:**

1. **Root cause:** ny `electron/scripts/afterPack.js`, registrert som
   electron-builder sin `afterPack`-hook, ad-hoc-signerer
   (`codesign --force --sign -`) alle filene i
   `Contents/Resources/postgres/bin/` etter pakking, for begge
   arkitekturer. En ad-hoc-signatur (ingen ekte sertifikat) er nok til at
   macOS godtar å kjøre dem – i tråd med at appen uansett allerede er
   bevisst usignert i sin helhet. Verifisert med en falsk `codesign`-
   kommando på PATH (samme mønster som launchd-testene): hooken finner og
   «signerer» riktig alle fem binærene, og er et trygt no-op på Linux
   (`process.platform !== 'darwin'`), så den ikke ødelegger de lokale
   `--mac dir`-testbyggene i denne økten.
2. **Bedre feilmeldinger uansett årsak:** alle stedene som kjører eksterne
   binærer synkront (`initdb` i `postgres.ts`, `prisma migrate deploy` i
   `migrate.ts`, `pg_dump`/`tar` i `backup.ts`, `pg_dump`/`pg_restore`/
   `cp`/`tar` i `migration.ts`) brukte `stdio: 'inherit'`, som i en
   dobbeltklikket GUI-app (ingen synlig terminal) sender all diagnostikk et
   sted brukeren aldri ser den – bare et bart avslutningskode-tall gjensto.
   Samlet i en ny delt `services/processUtils.ts` (`runOrThrow`) som
   fanger opp og skiller mellom tre reelle feilsituasjoner: prosessen kunne
   ikke startes i det hele tatt (`result.error`, f.eks. «finnes ikke»/
   «ingen kjøretillatelse»), den ble drept av et signal (`result.signal` –
   nettopp det som skjedde her, med en eksplisitt henvisning til usignerte
   binærfiler i selve feilteksten), eller den kjørte og avsluttet med en
   ekte feilkode (inkluderer da fangets stdout/stderr i feilmeldingen).
   Verifisert direkte (ikke bare lest): alle tre feilveiene og den normale
   suksessveien gir riktig resultat.

**IKKE VERIFISERT av Claude i denne utviklingsøkten:** at ad-hoc-signering
faktisk løser problemet i praksis – det kan kun bekreftes ved at eier
prøver en ny DMG bygget med denne fiksen. Hvis `initdb` fortsatt feiler
etter dette, vil den nye feilmeldingen (signal eller faktisk feiltekst fra
initdb selv) fortelle langt mer enn «avslutningskode null» gjorde.

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

## Installasjonsveiviseren (DR-12/DR-13) – hva som er verifisert

I tillegg til kjeden over ble selve førstegangs-veiviseren (`src/wizard/`)
verifisert med en ekte, headless GUI-drevet test: Playwright sin
`_electron`-driver styrte det virkelige veiviser-vinduet (fylte ut
datamappe/admin/PowerOffice-steg, klikket «Neste»/fullfør) i et Electron
kjørt under Xvfb, med Linux sine PostgreSQL-binærer symlenket inn som
beskrevet over. Dette fant og rettet tre reelle feil:

1. **`prisma/seed.ts` sin egen CLI-`main()` kjørte utilsiktet to ganger**
   når installasjonsveiviseren opprettet admin-brukeren: `installer-
   tasks.ts` importerte funksjoner fra `seed.ts`, og esbuild sin bundling
   av det bunter INN `seed.ts` sin `if (require.main === module)`-vakt i
   samme fil – som da feilaktig ble sann for HELE den bundlede filen.
   Løst ved å flytte den delte logikken til `prisma/seed-lib.ts` (uten
   noen kjør-hvis-direkte-vakt) og la `prisma/seed.ts` være en tynn
   CLI-inngang som aldri importeres av noe annet.
2. **Hele appen avsluttet i det øyeblikket veiviseren fullførte**: uten en
   egen `window-all-closed`-håndtering brukte Electron sin
   standardoppførsel (avslutt appen når siste vindu lukkes, gjelder
   Linux/Windows – ikke macOS), og veiviseren lukker jo alltid sitt eget
   (eneste) vindu programmatisk med det samme etter fullført oppsett. Dette
   drepte web-serveren/workeren før de rakk å bli nåbare. Rettet med en
   tom `app.on('window-all-closed', ...)` i `main.ts` – kun «Avslutt» i
   menylinjen skal faktisk avslutte denne menylinje-appen.
3. **`.env`-filen lekket inn i den pakkede appen**: Next.js sin
   `output: 'standalone'`-bygg kopierer automatisk `.env` inn i
   `.next/standalone/`, som `extraResources` da også kopierte videre inn i
   `Contents/Resources/app/` – dvs. utviklerens hemmeligheter (dev-
   passord, krypteringsnøkkel) ville blitt distribuert i DMG-en. Rettet
   med et `filter: ["**/*", "!.env*"]` på den `extraResources`-oppføringen
   i `package.json`.

Etter disse rettelsene fullfører veiviseren rent, oppretter kun ÉN
admin-bruker (ingen fantom-kjøring av `seed.ts`), og web-serveren svarer
`{"status":"ok","database":"ok"}` på `/api/health` etter at veiviseren har
lukket seg – uten at appen selv avslutter.

To av disse tre feilene (window-all-closed og race-conditions i
rettighets-/rolleoppsett løst tidligere med `createMany`+`skipDuplicates`
og en `submitInFlight`-vakt mot dobbel innsending) ville trolig IKKE vist
seg på en ekte Mac på samme måte, siden macOS sin Electron-standard for
«alle vinduer lukket» uansett er å ikke avslutte appen – men den eksplisitte
håndteringen er riktig og nødvendig uavhengig av plattform, så den beholdes.

## Instanslås mot dobbel oppstart (DR-07) – hva som er verifisert

`src/services/instanceLock.ts` skriver en liten `.lock`-fil (pid, maskinnavn,
tidspunkt) i datamappen før PostgreSQL startes, og fjerner den ved normal
avslutning. Dette er noe annet enn Electron sin egen
`requestSingleInstanceLock()` i `main.ts` (som kun hindrer at NØYAKTIG samme
app-binær startes to ganger på samme maskin) – denne låsen er knyttet til
selve DATAMAPPEN, og skal fange opp f.eks. en bærbar Mac i lokal modus og
Mac mini-en i servermodus som ved en feil peker mot samme datamappe.

Verifisert direkte (kaller `acquireInstanceLock()`/`releaseInstanceLock()` i
en ekte, kjørende Electron-prosess, med simulerte låsfil-tilstander):

- Frisk oppstart tar låsen og skriver riktig pid/maskinnavn/tidspunkt.
- En lås fra en LEVENDE prosess på samme maskin avvises med en klar
  feilmelding (og bekreftet uten å ha overskrevet den andre prosessens lås).
- En foreldet lås fra en KRASJET prosess på samme maskin (pid som ikke
  lenger finnes) overtas automatisk.
- En lås som peker til en ANNEN maskin avvises alltid (kan ikke verifiseres
  eksternt, se kommentaren i `instanceLock.ts` for resonnementet) – brukeren
  må bekrefte at den andre installasjonen er stoppet og fjerne låsfilen
  manuelt om det stemmer.
- Normal avslutning fjerner låsfilen igjen.

Selve `acquireInstanceLock()`-kallet ble testet isolert (uten å starte
PostgreSQL/web-server/worker for hvert scenario) – IKKE testet: den fulle
oppstartskjeden med to samtidige, ekte konkurrerende Electron-instanser (to
fulle GPU/Postgres/web-server-stabler samtidig i denne sandkassens Xvfb var
upålitelig av rene ressursgrunner, ikke en svakhet i selve låsen).

## Full eksport/import mellom lokal modus og Mac mini (DR-05) – hva som er verifisert

`src/services/migration.ts` pakker en installasjon til ÉN `.tar.gz`-fil
(«Eksporter for flytting …» i menylinjen) og gjenoppretter den igjen på en
annen installasjon (et nytt punkt i installasjonsveiviseren: «Importer
database, dokumenter og nøkler fra en eksportfil»). Filen inneholder:

- `database.dump` – KUN data (`pg_dump --data-only --format=custom`), ikke
  skjema: skjemaet lages uansett alltid på nytt av Prisma-migreringene på
  målmaskinen, så å flytte bare dataene unngår versjonskrøll.
- `documents/` – hele dokumentmappen.
- `master-key.txt` – kildens masternøkkel (DR-08). Uten denne ville
  PowerOffice-/e-postkonto-hemmelighetene i den importerte databasen vært
  umulige å dekryptere igjen, siden de er kryptert med KILDENS nøkkel, ikke
  en fersk nøkkel målmaskinen ellers ville generert selv. Importen
  overskriver derfor målmaskinens masternøkkel med denne.
- `manifest.json` – tidspunkt, antall dokumenter og en sha256-sjekksum av
  databasedumpen, som importen kontrollerer FØR noe skrives til den ekte
  databasen/datamappen (DR-05 sitt «kontroll av at alt er med»).

Verifisert direkte (to separate, ekte PostgreSQL-klynger som kilde/mål, en
ekte kjørende Electron-prosess for selve eksport-/importkallene):

- En full eksport→import-runde beholder en kunde, en admin-bruker OG en
  kryptert PowerOffice-nøkkel som fortsatt dekrypteres riktig med den
  importerte nøkkelen, samt begge testdokumentene (inkl. et i en
  underundermappe) med riktig innhold – alt sammen på målsiden, som startet
  som en helt tom, kun migrert database.
- En arkivfil som ikke kan pakkes ut (skadet gzip) avvises umiddelbart.
- En arkivfil med en tuklet `database.dump` (men ellers gyldig) avvises av
  sjekksumkontrollen FØR noe skrives til databasen – bekreftet ved at
  målets kundetabell fortsatt var tom etterpå.

Underveis fant og rettet denne verifiseringen én reell feil: `cp -R` med
kildeargumentet bygget via `path.join(kilde, '.')` kopierte selve
kildemappen (ikke bare innholdet) inn i en allerede eksisterende
destinasjon, siden `path.join` normaliserer bort den avsluttende `.` – ga
en dobbel-nestet `documents/documents/...`-struktur i arkivet. Rettet med
en egen `copyDirContents()`-hjelpefunksjon som bygger kildeargumentet som
en ren streng i stedet.

I samme slengen ble det også oppdaget (og rettet) at web-serveren/workeren
aldri fikk `STORAGE_DIR` satt i det hele tatt – dokumenter ville dermed
blitt lagret inni selve app-bunten i stedet for datamappen, noe som ville
ha gått tapt ved neste oppdatering (DR-14) OG ikke blitt tatt med i en
eksport i det hele tatt.

**IKKE testet:** selve veiviser-UI-et for import (filvelgeren bruker en
native macOS-dialog som ikke kan styres fra denne Linux-sandkassen) – kun
logikken bak (`exportInstallation`/`importInstallation`/`adoptMasterKey`)
er verifisert direkte. Se `src/wizard/wizard.html` sitt import-avkrysningsfelt
på steg 1.

## Utvidet backup-rotasjon og gjenoppretting (DR-06) – hva som er verifisert

30-dagers rotasjon fantes allerede (se `services/backup.ts`). Det som var
igjen: en reell DAGLIG jobb (ikke bare ved oppstart, siden en Mac mini i
servermodus kan stå på i ukevis) og gjenoppretting FRA ADMINISTRASJONSSIDEN
(ikke bare fra menylinjen/kommandolinjen).

- `main.ts` sjekker hver time om det er over 24 timer siden forrige backup
  (satt både ved oppstart og etter en manuell «Ta backup nå»), og tar en ny
  hvis så – uavhengig av om appen bare nettopp startet eller har stått på i
  flere dager.
- `pg_dump`-kallet i `services/backup.ts` (og det tilsvarende dev-skriptet
  `scripts/backup.ts`) endret til `--data-only --inserts
  --exclude-table=_prisma_migrations`: data-only (samme resonnement som
  DR-05) og INSERT-setninger i stedet for COPY-blokker, slik at
  gjenopprettingssiden i web-appen (`src/lib/backup.ts`) kan kjøre dumpen
  direkte som SQL uten pg_restore/psql sin COPY-strømmingsprotokoll, som en
  generisk SQL-driver ikke støtter. Prisma sin egen migreringstabell
  ekskluderes – migreringene kjører uansett alltid før en gjenoppretting og
  ville ellers kollidert med constraint-feil fra rader som finnes fra før.
- Ny side `src/app/admin/backup` (bak en ny rettighet `backup.manage`)
  lister tilgjengelige backuper og lar en administrator gjenopprette fra en
  av dem, med en obligatorisk bekreftelsestekst («GJENOPPRETT») siden dette
  er destruktivt (overskriver ALL nåværende data, logger ut alle brukere).
  Selve gjenopprettingen (`src/lib/backup.ts`) kjører i én databasetransaksjon
  (TRUNCATE av alle tabeller + gjeninnsetting fra dumpen), slik at en feil
  underveis ruller tilbake til tilstanden før forsøket i stedet for å
  etterlate databasen halvveis tømt. Dokumentmappen gjenopprettes separat
  etterpå (kan ikke være del av samme SQL-transaksjon), med den forrige
  mappen midlertidig flyttet til side (ikke slettet) til kopieringen er
  bekreftet vellykket.

Verifisert direkte mot en ekte PostgreSQL-database:

- En reell oppdaget feilkilde underveis: Prisma sin `$executeRawUnsafe`
  forbereder alltid spørringen (extended query protocol), som PostgreSQL
  nekter for en streng med flere SQL-kommandoer («cannot insert multiple
  commands into a prepared statement»). Løst ved å bruke `pg`
  (node-postgres) direkte for selve gjenopprettingen, som bruker samme
  «simple query»-protokoll som psql og dermed støtter dette.
- En annen oppdaget feilkilde: nyere `pg_dump` legger automatisk inn en
  `\restrict <nøkkel>`-psql-metakommando øverst i dumpen (gyldig for psql,
  men ugyldig SQL for en generisk klient) – filtreres bort før kjøring.
- Full runde (seed kunde + admin-bruker + en kryptert PowerOffice-nøkkel +
  et testdokument → ekte `pg_dump`-backup via samme kode som Electron
  bruker → simulert «katastrofe» (alt slettet) → `restoreBackup()`):
  kunden, PowerOffice-nøkkelen (dekrypteres riktig) og dokumentet er alle
  tilbake etter gjenoppretting.
- En korrupt/ugyldig databasedump avvises av PostgreSQL selv, og
  transaksjonen ruller riktig tilbake – bekreftet ved at en kontrollkunde
  fortsatt fantes uendret etter det mislykkede forsøket.
- Filnavnvalidering avviser path traversal-forsøk (`../../../etc/passwd`
  o.l.) og ugyldige/ikke-eksisterende filnavn korrekt.

**IKKE testet:** selve admin-siden i en nettleser (kun `src/lib/backup.ts`
sine funksjoner kalt direkte) og den planlagte daglige jobben i sanntid
(verifisert ved kodelesning + at selve `runBackupNow()`-kallet den bruker
fungerer, ikke ved å faktisk vente 24 timer).

## Oppdateringsflyt (DR-14) – hva som er verifisert

Appen har ingen auto-oppdatering – brukeren laster ned og installerer en ny
DMG manuelt over den gamle (DR-16). Selve «uten tap av data»-garantien var
allerede strukturelt på plass FØR denne oppgaven: datamappen (database,
dokumenter) ligger alltid utenfor `.app`-bunten (DR-02/DR-13), og en
automatisk backup tas alltid FØR migreringer kjører, på ENHVER oppstart
(DR-03) – inkludert den aller første oppstarten etter en oppdatering, uansett
om den bringer med seg nye migreringer. Det som manglet var å faktisk
OPPDAGE at dette skjedde, og gi brukeren en synlig bekreftelse på at
oppdateringen gikk bra og at en backup ble tatt automatisk før den – uten
dette skjer alt riktig, men usynlig.

- Ny `services/updateNotice.ts`: `notifyIfUpgraded(previousVersion,
  currentVersion)` sammenligner `lastKnownVersion` fra forrige lagrede
  `config.json` mot `app.getVersion()` og logger + viser et
  systemvarsel (`Notification`) når de er ulike. `previousVersion === null`
  (aller første oppstart) og lik versjon gir bevisst ingen varsling.
- `main.ts` kaller denne rett før `writeConfig` skriver den NYE versjonen
  til `config.json`, slik at sammenligningen skjer mot verdien fra FØR
  oppstarten – bruker forrige-versjonen som allerede lå i `AppConfig` (feltet
  fantes fra før, satt til `null` ved førstegangsoppsett).

Verifisert med en full simulert oppdateringssyklus (Playwright sin
`_electron`-driver mot en ekte PostgreSQL-database, forhåndsseedet
`config.json` med en gammel `lastKnownVersion`):

- Forventet loggmelding skrives ut, og `config.json` sin `lastKnownVersion`
  oppdateres korrekt fra den gamle testversjonen til appens ekte versjon.
- En seedet kundepost overlever hele den simulerte oppstartssyklusen
  uendret (bekreftet ved å restarte PostgreSQL og spørre direkte etter at
  Electron-testappen var lukket) – altså at DR-03 sin
  backup-før-migrering-rekkefølge faktisk ikke rører eksisterende data.
- Ingen varsling og ingen loggmelding ved aller første oppstart
  (`lastKnownVersion === null`) eller ved uendret versjon.

**IKKE testet:** at `Notification` faktisk vises som et ekte macOS-varsel –
`Notification.isSupported()` returnerer `false` i denne Linux-sandkassen
(forventet, ingen native varslingstjeneste her), så selve visningen er kun
verifisert ved kodelesning, ikke i praksis.

## Launchd-registrering i servermodus (DR-12) – hva som er verifisert

Task #61 dekket kun mote-valget (lokal/server) i veiviseren, ikke selve
launchd-halvparten av DR-12 («i servermodus registreres tjenestene i macOS
launchd, slik at de starter ved oppstart og restartes automatisk ved
krasj»). Denne oppgaven la til `services/launchd.ts` og koblet den inn i
`completeSetup()` i `main.ts`: når veiviseren fullføres med `mode ===
'server'`, registreres kontrollpanelet som et **LaunchAgent**
(`~/Library/LaunchAgents`), IKKE et LaunchDaemon – et LaunchDaemon kjører
som root uten tilgang til WindowServer/GUI-sesjonen og ville aldri klart å
vise menylinje-ikonet (DR-11). Se `docs/mac-mini-oppsett.md` for hvorfor
dette krever automatisk innlogging på Mac mini-en, og for manuelle
launchctl-kommandoer hvis den automatiske registreringen skulle feile (den
feiler ikke resten av oppsettet – bare varsler brukeren, siden en ellers
ferdig konfigurert installasjon (admin-bruker, migrert database) ikke skal
gå tapt på grunn av dette ene steget).

- `KeepAlive` er satt til `{ SuccessfulExit: false }`: launchd restarter
  KUN ved et krasj (avsluttet med en feilkode eller drept av et signal),
  ikke etter et vanlig «Avslutt» fra menylinjen (som avslutter med
  exit-kode 0) – ellers ville «Avslutt» vært virkningsløst i servermodus.
- `LimitLoadToSessionType: Aqua` begrenser registreringen til en ekte
  GUI-sesjon (ikke f.eks. innloggingsskjerm-sesjonen), i tråd med at appen
  trenger WindowServer for menylinje-ikonet sitt.
- En reinstallasjon (veiviseren kjørt på nytt på samme Mac) kaller først
  `launchctl bootout` på en eventuell EKSISTERENDE registrering før en ny
  `bootstrap`, for å unngå en «already bootstrapped»-feil fra launchctl.

**IKKE VERIFISERT av Claude i denne utviklingsøkten** (launchctl finnes ikke
på Linux): selve launchd-registreringen, restart-ved-krasj-oppførselen og
at et LaunchAgent faktisk starter ved automatisk innlogging etter et
strømbrudd. Det som ER verifisert direkte:

- Selve plist-strukturen er gyldig XML (parset med et XML-bibliotek) og
  inneholder de forventede nøklene (`Label`, `ProgramArguments`,
  `RunAtLoad`, `KeepAlive.SuccessfulExit=false`).
- Selve ORKESTRERINGEN (rekkefølgen og argumentene i launchctl-kallene) er
  testet med en falsk (mock) `launchctl`-kommando på PATH som logger
  kallene sine i stedet for å faktisk snakke med launchd: en fersk
  registrering kaller kun `bootstrap`, en re-registrering kaller `bootout`
  FØR `bootstrap`, `unregisterLaunchAgent()` kaller `bootout` og fjerner
  plist-filen, og et forsøk på å avregistrere en installasjon som ALDRI har
  vært registrert er et stille no-op (ingen launchctl-kall i det hele
  tatt, siden ingen plist-fil finnes å lese pid/status fra).

## Hva som gjenstår på en ekte Mac

- **Bekreftet av GitHub Actions (se «DMG-bygging i GitHub Actions» over),
  IKKE av Claude direkte:** at `npm run dist:mac:arm64`/`dist:mac:x64`
  faktisk produserer en DMG-fil. Det som gjenstår er selve
  INSTALLASJONEN og KJØRINGEN av disse DMG-ene på ekte maskinvare – ingen
  av dem er bekreftet å faktisk fungere etter installasjon ennå (arm64:
  ingen har testet på ekte Apple Silicon; x64: bygget for første gang som
  følge av at eier testet arm64-DMG-en på en Intel-Mac og den naturlig nok
  ikke fungerte der).
- At de faktiske PostgreSQL-binærene (både arm64 og x64 – ikke Linux sine,
  som ble brukt i verifiseringen under) fungerer likt i praksis, ikke bare
  at de kopieres riktig inn i DMG-en.
- At launchd-registreringen faktisk starter appen ved (automatisk)
  innlogging og restarter den ved krasj (DR-12) – bygget og
  orkestreringstestet med en falsk `launchctl`, se eget avsnitt over, men
  ikke kjørt mot en ekte launchd.
- At macOS sin nøkkelring faktisk lagrer/henter hemmeligheter riktig
  (DR-08).
- Selve DR-16-akseptansekriteriet: at en ny Mac uten annen programvare kan
  installere og kjøre DMG-en.
- Et ekte menylinje-ikon (`resources/trayTemplate.png` er i dag en
  1×1-plassholder, se kommentaren i `src/tray.ts`).
- **Oppdaget, men IKKE rettet i denne økten** (utenfor DR-05 sitt omfang):
  `webServer.ts` binder alltid til `127.0.0.1`, uansett `mode`
  ('local'/'server') i `config.json`. Wizarden lar brukeren velge
  servermodus med teksten «alle på kontornettet», men servermodus har i dag
  ingen faktisk funksjonell forskjell fra lokal modus bortsett fra
  metadataen som lagres – web-serveren er IKKE nåbar fra andre maskiner på
  nettverket ennå. Bør rettes (trolig `HOSTNAME: config.mode === 'server' ?
  '0.0.0.0' : '127.0.0.1'`) når launchd-/servermodus-oppgaven tas fatt.
