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

- At de faktiske arm64-PostgreSQL-binærene (ikke Linux sine, som ble brukt
  i verifiseringen over) fungerer likt.
- At `npm run dist:mac` faktisk produserer en installerbar DMG.
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
