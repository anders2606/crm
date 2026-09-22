# Pietra Unica CRM

Eget CRM-system for Pietra Unica (marmor.no). Se `docs/kravspesifikasjon.md` for fullstendige krav og `CLAUDE.md` for arbeidsreglene som gjelder når systemet bygges videre med Claude Code.

## Status

**M0 Fundament, M1 Kunder og leverandører og M2 Dokumenter er bygget.** Se statustabellen i `CLAUDE.md` for øvrige milepæler.

- M0: innlogging med 2FA, roller/rettigheter, revisjonslogg, helsesjekk, backup-skript.
- M1: kunder og leverandører med kontaktpersoner, adresser, kundegrupper, samtykke, tidslinje og oppgaver; duplikatkontroll ved registrering; enkelt fellessøk (GE-05) på tvers av kunder/leverandører.
- M2: dokumentopplasting (dra-og-slipp, også fra mobilkamera) på kunde-/leverandørkortet, med kategorisering, inline forhåndsvisning av PDF/bilder og versjonering av tegninger.

## Oppstart (utvikling)

Forutsetter Node.js 20+ og en lokal PostgreSQL 16.

1. Kopier `.env.example` til `.env` og fyll ut:
   - `DATABASE_URL` – peker på en lokal Postgres-database.
   - `SESSION_SECRET` – generer med `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   - `SEED_ADMIN_PASSWORD` – et utviklingspassord for seed-administratoren (aldri et ekte passord).
2. Start en lokal Postgres, f.eks. med `docker compose up -d` (bruker `docker-compose.yml`), eller en systeminstallert Postgres.
3. Installer avhengigheter: `npm install`.
4. Kjør migreringer: `npm run db:migrate`.
5. Seed grunndata (rettigheter, roller «Administrator»/«Selger», én admin-bruker): `npm run db:seed`.
6. Start appen: `npm run dev` og åpne http://localhost:3000.
7. Logg inn med e-posten/passordet skriptet skrev ut. Ved første innlogging vises en 2FA-nøkkel du legger inn i en autentiseringsapp (Apple Kodegenerator, Google Authenticator e.l.) – dette er obligatorisk (GE-04).

## Tester

- Enhetstester: `npm run test` (Vitest – passordhash, TOTP, RBAC).
- Ende-til-ende-tester: `npm run test:e2e` (Playwright – egen testdatabase nullstilles og seedes automatisk, se `tests/e2e/global-setup.ts`). Krever at Playwrights nettlesere er installert (`npx playwright install chromium`), eller at `PLAYWRIGHT_CHROMIUM_PATH` peker på en installert Chromium.
- Typecheck: `npm run typecheck`. Lint: `npm run lint`.

## Drift og backup

- `npm run db:backup` tar en `pg_dump` av databasen OG et `tar.gz`-arkiv av dokumentmappen (`STORAGE_DIR`) til `BACKUP_DIR` (standard `./data/backups`), og fjerner begge deler når de er eldre enn `BACKUP_RETENTION_DAYS` (standard 30 dager). Kjøres automatisk før `npm run dev`/`npm run start` (DR-03), forutsatt at `pg_dump`/`tar` finnes i PATH.
- Dokumenter lagres på lokal disk under `STORAGE_DIR` (standard `./data/documents`), bak et lagringsgrensesnitt (`src/lib/storage.ts`) slik at DO-08 kan utvides til S3 senere uten kodeendring.
- Helsesjekk: `GET /api/health` (IF-06) svarer 200 når databasen er tilgjengelig, ellers 503.
- **Gjenstår til M9 (serverpakke):** DMG-pakking, kontrollpanel, launchd-oppstart i servermodus, full 30-dagers rotasjon til ekstern/kryptert disk (database OG dokumenter), og migrering mellom lokal modus og Mac mini (DR-05, DR-10–17).
- **Gjenstår ellers:** nøkler i macOS-nøkkelring i stedet for `.env` er planlagt for lokal modus/servermodus (DR-08) – i utvikling brukes kun `.env` per arbeidsregel 6.

## Arkitektur

- Next.js 14 (App Router), TypeScript strict, Tailwind CSS.
- PostgreSQL 16 + Prisma. M0: User, Role, Permission, Session, AuditLog. M1: Customer, Supplier,
  Address, ContactPerson, CustomerGroup, Consent, Activity, Task.
- Innlogging: passord (scrypt, ingen ekstern avhengighet) + obligatorisk TOTP to-faktor (håndrullet etter RFC 6238, ingen ekstern avhengighet), sesjon lagret i database.
- Rettigheter sjekkes på serveren i hver side/server action/API-rute (`src/lib/rbac`), aldri kun i grensesnittet.
- Alle endringer logges i `AuditLog` (`src/lib/audit`).
- Penger lagres som heltall i øre/cent med valutakode (`src/lib/money`), aldri flyttall.
- `Address`/`ContactPerson`/`Consent` peker på enten kunde ELLER leverandør (håndhevet med en
  CHECK-constraint i migreringen). `Activity`/`Task` bruker samme `entityType`+`entityId`-mønster
  som `AuditLog`, slik at flere entiteter (tilbud, ordre, prosjekt …) kan kobles på senere uten
  skjemaendring.

## M1: hva som er bygget og hva som gjenstår

Dekker MÅ-kravene KU-01–06, KU-11, KU-12, LE-01–05, LE-09 og GE-07 (kap. 19), samt datamodellen for
KU-08/KU-03 (selve PowerOffice-synken og saldovisningen kommer i M6) og et første steg av GE-05
(fellessøk, foreløpig kunder/leverandører – utvides med dokumenter/e-post/tilbud/ordre/bilag i
M2/M3/M5/M7).

**Bevisst utsatt** (BØR/KAN eller avhenger av senere milepæler): KU-07 (Brønnøysund-oppslag – krever
workeren, kap. 15/18, som ikke er bygget ennå), KU-09 (kobling kunde↔prosjekt), LE-06
(e-postintegrasjon → M3), LE-07/08 (bilag/betaling → M7), LE-10–12.

## M2: hva som er bygget og hva som gjenstår

Dekker MÅ-kravene DO-01–05 og DO-08 (kap. 19). `Document` kobles til Customer/Supplier med samme
`entityType`+`entityId`-mønster som Activity/Task (Project/Quote/Order/Material/EmailMessage
finnes ikke før senere milepæler). Ny versjon av et dokument setter forrige `isCurrent=false`, men
den slettes aldri og forblir åpnebar.

**Bevisst utsatt:** DO-06 (fulltekst-søk/OCR med Tesseract – BØR, egen indekseringsjobb), DO-07
(dele dokument som e-postvedlegg – avhenger av e-postutsending i M3), DO-09 (DWG-visning i
nettleser – KAN, kun etter avtale med eier).
