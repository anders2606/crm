# PostgreSQL-binærer (DR-10)

Denne mappen skal, før `npm run dist:mac` kjøres på en Mac, inneholde:

```
bin/
  postgres
  initdb
  createdb
  pg_dump
  pg_restore
```

Alle for **macOS Apple Silicon (arm64)**, siden appen kun leveres for den
arkitekturen (DR-10). Binærene er IKKE lagt i git – de er
plattformspesifikke og på over 100 MB til sammen.

## Hvor de kan hentes fra

Et par alternativer, foretrukket øverst:

1. **EDB sin offisielle binærdistribusjon**
   (https://www.enterprisedb.com/download-postgresql-binaries) – last ned
   arm64-pakken for macOS, pakk ut, og kopier filene fra `pgsql/bin/` inn
   i `bin/` her. Dette er en relokerbar distribusjon (ikke avhengig av en
   fast installasjonssti), som er nødvendig siden appens datamappe
   varierer per bruker.
2. **Postgres.app** (https://postgresapp.com/) – appens binærer ligger
   under `Contents/Versions/<versjon>/bin/`. Fungerer, men er tenkt som en
   frittstående app, ikke for gjenbruk – verifiser at binærene faktisk er
   relokerbare (kjør dem fra en annen mappe enn der Postgres.app selv
   ligger) før dette velges.

Bruk samme hovedversjon som `binaryTargets`/utviklingsmiljøet er testet
mot (PostgreSQL 16 i denne kodebasen, se `docker-compose.yml`).

## Hvorfor ikke bare kreve Homebrew

Kravspesifikasjonen (DR-02) er eksplisitt: «Lokal modus startes uten
Docker, terminal eller forhåndsinstallert programvare. Node og PostgreSQL
følger med appen.» Å kreve at eieren selv installerer PostgreSQL via
Homebrew før appen kan brukes, bryter med dette – derfor bundles
binærene i appen i stedet.
