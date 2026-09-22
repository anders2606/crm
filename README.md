# Pietra Unica CRM

Eget CRM-system for Pietra Unica (marmor.no). Se `docs/kravspesifikasjon.md` for fullstendige krav og `CLAUDE.md` for arbeidsreglene som gjelder når systemet bygges videre med Claude Code.

## Status

**M0 Fundament, M1 Kunder og leverandører, M2 Dokumenter, M3 E-post og M4 Materialbibliotek er
bygget.** Se statustabellen i `CLAUDE.md` for øvrige milepæler.

- M0: innlogging med 2FA, roller/rettigheter, revisjonslogg, helsesjekk, backup-skript.
- M1: kunder og leverandører med kontaktpersoner, adresser, kundegrupper, samtykke, tidslinje og oppgaver; duplikatkontroll ved registrering; enkelt fellessøk (GE-05) på tvers av kunder/leverandører.
- M2: dokumentopplasting (dra-og-slipp, også fra mobilkamera) på kunde-/leverandørkortet, med kategorisering, inline forhåndsvisning av PDF/bilder og versjonering av tegninger.
- M3: egen worker-prosess synker e-postkontoer (IMAP IDLE + periodisk synk) og kobler automatisk
  e-post til kunde/leverandør på tidslinjen; ukjente havner i en tilordningskø; vedlegg havner i
  dokumentarkivet.
- M4: materialbibliotek med bilder, leverandørkobling, historiske innkjøps-/utsalgspriser (omregnet
  til NOK med daglige Norges Bank-kurser hentet av workeren) og en enkel prisgraf.

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
8. For e-post (M3) og valutakurser (M4): start workeren i et eget terminalvindu med `npm run worker`. Uten den synkroniseres verken e-post eller valutakurser.

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

## M3: hva som er bygget og hva som gjenstår

Dekker MÅ-kravene EP-01–07 (kap. 19). Egen worker-prosess (`src/worker`, `npm run worker`) synker
hver aktive e-postkonto: IMAP IDLE i sanntid mot ekte kontoer, pluss periodisk synk hvert minutt som
alltid kjører (reserve-mekanismen fra kap. 18, holder god margin til akseptansekriteriet «innen 2
minutter»). E-post kobles automatisk til kunde/leverandør på eksakt adresse, så domene (ikke for
gmail.com/hotmail.com e.l.) og vises på tidslinjen. Ukjente havner i tilordningskøen
(`/email/unassigned`) for manuell kobling. Vedlegg lagres i dokumentarkivet (gjenbruker M2), og
flyttes til riktig kunde/leverandør når en melding tilordnes manuelt. Samme e-post synkronisert to
ganger gir én rad (unik per konto+mappe+IMAP-UID).

E-postintegrasjonen (`src/integrations/mail`) ligger bak et grensesnitt med en mock-variant (brukt i
alle automatiske tester) og en ekte variant (imapflow/nodemailer/mailparser mot IMAP/SMTP). Ekte
tilkobling slås på med `MAIL_INTEGRATION_MODE=real` i workerens miljø – står til `mock` ellers, slik
at ingen vanlig utvikling eller tester rører ekte postbokser (arbeidsregel 5).

**Passord for e-postkontoer** krypteres i databasen (AES-256-GCM, `ENCRYPTION_KEY` i `.env`) siden
ekte macOS-nøkkelring (DR-08) først bygges i M9. Du valgte ikke eksplisitt mellom dette og
env-only-alternativet jeg foreslo – jeg gikk med det anbefalte (kryptert i database), siden det er
tryggere og gir en avgrenset overgang til nøkkelring senere. Si ifra om du vil ha det annerledes.

**Viktig – ikke verifisert mot ekte Domeneshop-server i denne økten:** denne
utviklingsøkten kjører i en sandkasse som kun tillater utgående HTTPS-trafikk gjennom en
policy-proxy; IMAP (993) og SMTP (465) er ikke tilgjengelig herfra, og forsøket på reell
tilkobling til testkontoen din (`test@pietraunica.no`) fikk tidsavbrudd på TCP-nivå av den
grunn. Alt av synk/kobling/tidslinje/dedup/sending er testet grundig mot mock-integrasjonen
(13 e2e-tester, alle grønne), men selve nettverkskoden mot Domeneshop er ikke bekreftet i praksis.
**Test selv:** sett `MAIL_INTEGRATION_MODE=real` i `.env`, kjør `npm run worker`, opprett
testkontoen under «E-postkontoer» i grensesnittet (bruk verdiene fra `TEST_EMAIL_*` i `.env`), og
se om e-post faktisk synkes. Si ifra om noe ikke fungerer, så retter jeg det.

**Bevisst utsatt:** EP-08 (sende e-post med maler/flettefelt fra CRM – selve sending+arkivering i
Sendt-mappen er bygget og testet i integrasjonslaget, men ingen skriv-e-post-side i grensesnittet
ennå), EP-09 (trådvisning), EP-10 (manuell kobling via BCC til CRM, KAN – kun etter avtale). Det
finnes heller ingen side for å lese hele e-postteksten ennå – tidslinjen viser at meldingen kom, med
emne; full lesevisning kommer med EP-08/EP-09 i M8.

## M4: hva som er bygget og hva som gjenstår

Dekker MÅ-kravene MA-01–04, MA-06 og MA-08 (kap. 19). Bilder (MA-02) gjenbruker `Document` fra M2.
Prisgrafen (MA-04) er en enkel, håndtegnet SVG-linje uten nytt diagrambibliotek.

**Valutakurser (MA-03):** workeren henter daglige kurser fra Norges Banks åpne API hver morgen
kl. 06 (og backfiller ca. 2 år tilbake ved oppstart for valutaer i bruk), lagrer dem lokalt, og
prisregistrering slår opp kursen for datoen – med fallback til siste kjente kurs ved helg/helligdag
(kap. 18). Denne HTTP-integrasjonen (`src/integrations/exchange-rates`) følger samme
mock/ekte-mønster som e-post: mock i alle tester, ekte kun fra workeren
(`EXCHANGE_RATE_INTEGRATION_MODE=real`).

**Viktig – heller ikke denne integrasjonen er verifisert mot den ekte tjenesten:** i motsetning
til IMAP/SMTP er Norges Banks API vanlig HTTPS, så jeg forsøkte å teste den live i denne økten –
men det viste seg at utviklingsøkten kun tillater utgående HTTPS til et fast allowlist av verter
(npm, PyPI o.l.), og data.norges-bank.no er ikke blant dem (samme `curl` fikk 403 mot f.eks.
google.com også). CSV-tolkingen i `src/integrations/exchange-rates/real.ts` er skrevet etter beste
kjennskap til Norges Banks dokumenterte format (kolonnenavnene `TIME_PERIOD`/`OBS_VALUE` er faste
SDMX-navn), men er ikke kjørt mot den ekte tjenesten. **Test selv:** sett
`EXCHANGE_RATE_INTEGRATION_MODE=real` i `.env`, kjør `npm run worker`, og se i loggen om kurser
faktisk hentes inn (`npx prisma studio` kan brukes til å se `exchange_rates`-tabellen). Si ifra om
noe ikke stemmer.

**Bevisst utsatt:** MA-05 (automatisk oppdatering av innkjøpspriser fra leverandørfakturaer/tilbud –
avhenger av M5/M7), MA-07 (tekstblokk-integrasjon for vedlikeholdsråd – fritekstfelt er på plass,
selve tekstblokk-systemet kommer med SD-02 i M5), MA-09/MA-10 (lagerstatus og publisering til
marmor.no, KAN – kun etter avtale med deg).
