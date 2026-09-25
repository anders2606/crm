# PostgreSQL-binærer (DR-10)

Appen leveres som to SEPARATE DMG-er – én for Apple Silicon (arm64) og én
for Intel (x64), se `../../README.md` sin «Bygge DMG-en»-seksjon (endret
fra kun arm64 etter at eier testet på en Intel-Mac). PostgreSQL-binærene
er arkitekturspesifikke, så denne mappen kan bare inneholde ÉN
arkitektur om gangen – du bygger derfor DMG-ene i to atskilte omganger,
og legger inn riktig sett med binærer FØR hver av dem:

```
bin/
  postgres
  initdb
  createdb
  pg_dump
  pg_restore
lib/
  (ALT fra pgsql/lib/ i nedlastingen – se under)
share/
  (ALT fra pgsql/share/ i nedlastingen – se under)
```

**Verken `lib/` eller `share/` er valgfrie**, begge må ligge ved siden av
`bin/` nøyaktig slik strukturen er i selve nedlastingen:

- `lib/`: de fem binærene over er dynamisk lenket mot delte biblioteker
  (libpq/libssl/libicu osv.). Uten `lib/` klarer ikke macOS å laste dem i
  det hele tatt – dette ga en ekte, forvirrende feil («stanset av signal
  SIGABRT») da eier testet appen første gang, ETTER at selve binærene i
  `bin/` var ad-hoc-signert (se `../../scripts/afterPack.js`, som signerer
  BEGGE mappene av nøyaktig denne grunnen).
- `share/`: `initdb` finner referansedataene sine her (`postgres.bki` –
  definerer det innledende systemkatalog-innholdet i en helt fersk klynge,
  tidssonedata osv.). Uten `share/` feiler `initdb` med at
  `.../share/postgresql/postgres.bki does not exist` – nøyaktig den NESTE
  ekte feilen eier fikk, ETTER at signering og `lib/` var på plass (altså
  at `initdb` da faktisk kjørte, men manglet disse referansefilene helt).

Binærene/bibliotekene/referansedataene er IKKE lagt i git – de er
plattformspesifikke og på over 100 MB til sammen.

## Hvor de kan hentes fra

Et par alternativer, foretrukket øverst:

1. **EDB sin offisielle binærdistribusjon**
   (https://www.enterprisedb.com/download-postgresql-binaries) – last ned
   pakken for macOS (velg arm64 eller x64 alt etter hvilken DMG du bygger
   akkurat nå), pakk ut, og kopier filene fra `pgsql/bin/` inn i `bin/`,
   hele `pgsql/lib/` inn i `lib/`, OG hele `pgsql/share/` inn i `share/`
   her (se over for hvorfor verken `lib/` eller `share/` er valgfrie).
   Dette er en relokerbar distribusjon (ikke avhengig av en fast
   installasjonssti), som er nødvendig siden appens datamappe varierer per
   bruker. Sjekk arkitekturen på det du har lastet ned med
   `lipo -info bin/postgres` (eller `file bin/postgres`) før du bygger –
   den skal si `arm64` eller `x86_64`, ikke begge (et par av EDB sine
   nyere pakker er universelle/fete binærer som fungerer for begge; da kan
   samme nedlasting brukes til begge DMG-ene).
2. **Postgres.app** (https://postgresapp.com/) – appens binærer ligger
   under `Contents/Versions/<versjon>/bin/`. Fungerer, men er tenkt som en
   frittstående app, ikke for gjenbruk – verifiser at binærene faktisk er
   relokerbare (kjør dem fra en annen mappe enn der Postgres.app selv
   ligger) før dette velges.

Bruk samme hovedversjon som `binaryTargets`/utviklingsmiljøet er testet
mot (PostgreSQL 16 i denne kodebasen, se `docker-compose.yml`).

## Bygg i to omganger

```bash
# 1. Legg arm64-versjonen i bin/, lib/ OG share/, bygg, og flytt unna resultatet:
npm run dist:mac:arm64
mv release/*.dmg ~/Desktop/pietra-unica-crm-arm64.dmg

# 2. Bytt ut bin/, lib/ OG share/ med x64-versjonene, og bygg på nytt:
rm -rf bin lib share
# (kopier inn x64-versjonen av alle tre mappene her)
npm run dist:mac:x64
mv release/*.dmg ~/Desktop/pietra-unica-crm-x64.dmg
```

`.github/workflows/build-dmg.yml` i repo-roten gjør akkurat dette
automatisk (én jobb per arkitektur) hvis du heller vil bygge via GitHub
Actions.

## Hvorfor ikke bare kreve Homebrew

Kravspesifikasjonen (DR-02) er eksplisitt: «Lokal modus startes uten
Docker, terminal eller forhåndsinstallert programvare. Node og PostgreSQL
følger med appen.» Å kreve at eieren selv installerer PostgreSQL via
Homebrew før appen kan brukes, bryter med dette – derfor bundles
binærene i appen i stedet.
