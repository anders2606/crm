# Pietra Unica CRM

Eget CRM-system for Pietra Unica (marmor.no). Se `docs/kravspesifikasjon.md` for fullstendige krav og `CLAUDE.md` for arbeidsreglene som gjelder når systemet bygges videre med Claude Code.

## Status

**M0 Fundament er bygget** (GE-01–06, GE-04, GE-06, IF-06, DR-08 delvis – se "Hva gjenstår" under). Se statustabellen i `CLAUDE.md` for øvrige milepæler.

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

- `npm run db:backup` tar en `pg_dump` av databasen til `BACKUP_DIR` (standard `./data/backups`) og fjerner dumper eldre enn `BACKUP_RETENTION_DAYS` (standard 30 dager). Kjøres automatisk før `npm run dev`/`npm run start` (DR-03), forutsatt at `pg_dump` finnes i PATH.
- Helsesjekk: `GET /api/health` (IF-06) svarer 200 når databasen er tilgjengelig, ellers 503.
- **Gjenstår til M9 (serverpakke):** DMG-pakking, kontrollpanel, launchd-oppstart i servermodus, full 30-dagers rotasjon til ekstern/kryptert disk, og migrering mellom lokal modus og Mac mini (DR-05, DR-10–17).
- **Gjenstår ellers:** nøkler i macOS-nøkkelring i stedet for `.env` er planlagt for lokal modus/servermodus (DR-08) – i utvikling brukes kun `.env` per arbeidsregel 6.

## Arkitektur i M0

- Next.js 14 (App Router), TypeScript strict, Tailwind CSS.
- PostgreSQL 16 + Prisma (modeller: User, Role, Permission, Session, AuditLog).
- Innlogging: passord (scrypt, ingen ekstern avhengighet) + obligatorisk TOTP to-faktor (håndrullet etter RFC 6238, ingen ekstern avhengighet), sesjon lagret i database.
- Rettigheter sjekkes på serveren i hver side/server action/API-rute (`src/lib/rbac`), aldri kun i grensesnittet.
- Alle endringer logges i `AuditLog` (`src/lib/audit`).
