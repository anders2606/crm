# Pietra Unica CRM

Eget CRM-system for Pietra Unica (marmor.no), en norsk marmorforhandler. Systemet bygges etter kravspesifikasjonen i `docs/kravspesifikasjon.md`. Les den før du starter en ny milepæl, og slå opp i den når noe er uklart.

## Viktigste filer

- `docs/kravspesifikasjon.md` – fasit for alle krav (krav-ID-er, stack, datamodell, byggeplan).
- `docs/poweroffice-apiv2-demo.json` – OpenAPI-spesifikasjon for PowerOffice Go API v2 (demo). Generer typet klient fra denne, ikke gjett endepunkter.
- `docs/mac-mini-oppsett.md` – veiledning for å installere den usignerte DMG-en og sette opp en Mac mini som server (DR-16, DR-17).

## Arbeidsregler

1. **Kravspesifikasjonen er fasit.** Er et krav uklart eller i konflikt med et annet: stopp og spør eier i stedet for å gjette. Når eier tar en ny beslutning, foreslå tilsvarende endring i `docs/kravspesifikasjon.md`.
2. **Én milepæl om gangen**, i rekkefølgen i kap. 19 (M0 → M10). Start hver milepæl med en kort plan (filer, datamodellendringer, tester) og vent på godkjenning før du bygger.
3. **Krav-ID i alt:** commit-meldinger, testnavn og kodekommentarer refererer krav-ID der det er naturlig, f.eks. `feat(KU-10): duplikatkontroll på org.nr`.
4. **Tester først for forretningsregler:** beløp, MVA, oppfølgingsregler, e-postkobling, bilagsparing og rettigheter skal ha enhetstester. Hver milepæl får minst én ende-til-ende-test. Akseptansekriteriene i kap. 19 skal dekkes av tester.
5. **Aldri ekte data eller produksjonsnøkler i utvikling.** Bruk seed-data, PowerOffice demo-miljø, mock for bank, og kun e-posttestkontoen (aldri ekte postbokser). Ingen tester sender e-post til ekte mottakere.
6. **Hemmeligheter:** i utvikling kun i `.env` (aldri committet). Hold `.env.example` oppdatert med alle nøkler uten verdier. I lokal modus og servermodus ligger hemmeligheter i macOS-nøkkelringen (DR-08). Skriv aldri nøkler i kode, logger eller commit-meldinger.
7. **Databaseendringer kun via Prisma-migreringer.** Migreringer som sletter eller endrer eksisterende data krever eksplisitt godkjenning fra eier.
8. **Rettigheter sjekkes på serveren** i hver server action og API-rute, ikke bare i grensesnittet.
9. **Norsk i grensesnitt, engelsk i kode.** Alle brukertekster i språkfiler. Tidssone Europe/Oslo, norsk dato- og tallformat.
10. **Penger som heltall** i øre (minste valutaenhet) med valutakode. Aldri flyttall.
11. **Hold det enkelt:** ingen nye avhengigheter eller tjenester utover kap. 15 uten begrunnelse og godkjenning. Ingen tjenester med abonnement eller bruksbasert pris. Ingen del av systemet skal være åpent mot internett.
12. **Eksterne systemer kun fra workeren**, aldri direkte i en brukerforespørsel. Hver integrasjon ligger i `src/integrations/<navn>` med felles grensesnitt og mock.
13. **Etter hver milepæl:** oppdater `README.md` (oppstart, drift, backup), kjør alle tester, og skriv en kort oppsummering: hva som er bygget, hvilke krav-ID-er som er dekket, og hva som gjenstår. Oppdater statusen under.

## Eier

Eier er ikke utvikler. Forklar valg og kommandoer kort og på norsk, og si tydelig når eier må gjøre noe selv (f.eks. legge inn nøkler, teste i nettleseren, godkjenne en plan).

## Status

| Milepæl | Status |
| --- | --- |
| M0 Fundament | Bygget (se README for detaljer og gjenstående DR-08/M9-punkter) |
| M1 Kunder og leverandører | Bygget (se README for detaljer og bevisst utsatte BØR-punkter) |
| M2 Dokumenter | Bygget (se README for detaljer og bevisst utsatte BØR/KAN-punkter) |
| M3 E-post | Bygget – NB: reell IMAP/SMTP-tilkobling mot Domeneshop ikke verifisert av Claude (nettverksbegrensning i utviklingsøkten), se README | 
| M4 Materialbibliotek | Bygget – NB: reell Norges Bank-tilkobling ikke verifisert av Claude (samme nettverksbegrensning som M3), se README |
| M5 Tilbud og ordre | Bygget (se README for detaljer og bevisst utsatte BØR-punkter) |
| M6 PowerOffice | Bygget – NB: PowerOffice sin produksjons-URL og ekte demo-tilkobling ikke verifisert av Claude (samme nettverksbegrensning som M3/M4), se README |
| M7 Bilag og betalinger | Bygget (se README for detaljer og bevisst utsatte BØR/KAN-punkter) |
| M8 Utsendelser og rapporter | Bygget (se README for detaljer og bevisst utsatt GE-12) |
| M9 Serverpakke (DMG) | Bygget – prosessadministrasjon (DR-10/DR-11), nøkkelring (DR-08), installasjonsveiviser og launchd-registrering i servermodus (DR-12/DR-13), instanslås (DR-07), eksport/import (DR-05), utvidet backup/gjenoppretting (DR-06), oppdateringsflyt (DR-14) og veiledning for usignert DMG/Mac mini-oppsett (DR-16/DR-17). DR-15 (ekstern tilgang, KAN) bevisst utsatt. IKKE verifisert på ekte macOS – kun headless testet fra en Linux-økt (se electron/README.md) |
| M10 KI-modul (valgfri) | Ikke startet |
