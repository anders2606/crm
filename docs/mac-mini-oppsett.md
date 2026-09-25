# Sette opp Mac mini som server (DR-16, DR-17)

Denne veiledningen er for servermodus: en Mac mini som skal stå fast tilkoblet
kontornettet og kjøre Pietra Unica CRM for alle, i motsetning til lokal modus
(én person, én Mac). Se `docs/kravspesifikasjon.md` kap. 19 (M9) for kravene
den dekker (DR-16, DR-17), og `electron/README.md` for hvordan selve appen er
bygget opp.

## 1. Installere den usignerte DMG-en (DR-16)

Pietra Unica CRM er ikke signert med et Apple-utviklersertifikat (det koster
et årlig abonnement Pietra Unica ikke trenger for en app som kun brukes internt
– se arbeidsregel 11 i `CLAUDE.md`). macOS sin Gatekeeper blokkerer derfor
appen ved første åpning, med en advarsel om at den «ikke kan åpnes fordi den
er fra en ukjent utvikler» eller lignende. Dette er forventet, og godkjennes
slik:

1. Dobbeltklikk DMG-filen og dra **Pietra Unica CRM** inn i **Applications**-mappen.
2. Åpne appen (dobbeltklikk i Applications, eller Launchpad). macOS viser en
   advarsel og nekter å åpne den.
3. Åpne **Systeminnstillinger → Personvern og sikkerhet**, og scroll ned til
   seksjonen om sikkerhet. Der står det en melding om at «Pietra Unica CRM» ble
   blokkert, med en knapp **Åpne likevel**. Trykk på den.
4. Bekreft med Touch ID eller administratorpassordet.
5. Appen åpnes nå normalt, og legges automatisk til på macOS sin
   unntaksliste – dette trengs kun én gang per Mac.

På eldre macOS-versjoner (uten dette punktet i Personvern og sikkerhet):
Control-klikk (eller høyreklikk) appen i Applications → **Åpne** → bekreft
**Åpne** i dialogboksen som dukker opp.

## 2. Automatisk innlogging (forutsetning for DR-12)

Kontrollpanelet registreres i macOS sitt **launchd** når servermodus velges i
installasjonsveiviseren (DR-12, se `electron/src/services/launchd.ts`), slik
at det starter automatisk og restartes ved krasj. Dette registreres som et
**LaunchAgent**, ikke et LaunchDaemon – det er den eneste varianten som får
tilgang til GUI-sesjonen (WindowServer) og dermed kan vise menylinje-ikonet
(DR-11). Konsekvensen er at et LaunchAgent først starter når **en bruker
logger inn**, ikke ved selve strømpåslaget. Uten automatisk innlogging ville
Mac mini-en stå og vente på innloggingsskjermen etter et strømbrudd, uten at
CRM-et noen gang starter, til noen fysisk møter opp og logger inn.

Sett derfor opp automatisk innlogging:

1. **Systeminnstillinger → Generelt → Innlogging og passord** (eller
   **Brukere og grupper**, avhengig av macOS-versjon).
2. Slå på **Automatisk innlogging**, og velg kontoen Pietra Unica CRM er
   installert på.

Dette krever at kontoen ikke har FileVault-kryptering koblet til
innloggingspassordet på en måte som hindrer automatisk innlogging – på
moderne macOS er dette normalt likevel mulig (se punkt 4 under). Om
Systeminnstillinger nekter å slå på automatisk innlogging med FileVault på,
er det en kjent macOS-begrensning avhengig av versjon; kontakt support i så
fall i stedet for å slå av FileVault.

## 3. Ikke gå i dvale

Mac mini-en må ikke gå i dvale, ellers stopper database/web-server/worker og
ingen på kontoret får tilgang til CRM-et:

1. **Systeminnstillinger → Lås skjerm** (eller **Energisparing** på eldre
   macOS).
2. Sett **Datamaskinen går i dvale når den er inaktiv** (eller tilsvarende) til
   **Aldri**.
3. Skjermen kan fortsatt slås av for å spare strøm/skjermens levetid – det er
   forskjellig fra selve datamaskinen som går i dvale, og påvirker ikke
   CRM-et.

## 4. Start automatisk etter strømbrudd

1. **Systeminnstillinger → Energisparing** (kan hete **Strømsparing** eller
   ligge under **Batteri** avhengig av versjon).
2. Slå på **Start automatisk etter strømbrudd** (**«Start up automatically
   after a power failure»**).

Uten dette blir Mac mini-en stående AV etter et strømbrudd til noen fysisk
trykker på av/på-knappen – selv med launchd og automatisk innlogging riktig
satt opp.

## 5. FileVault-kryptering

Datamappen inneholder kundedata, PowerOffice-nøkler (riktignok allerede
kryptert, DR-08) og dokumenter. Disken bør derfor være kryptert i tilfelle
Mac mini-en blir stjålet:

1. **Systeminnstillinger → Personvern og sikkerhet → FileVault**.
2. Slå på FileVault.
3. **Lagre gjenopprettingsnøkkelen trygt** (f.eks. i en passordbehandler,
   eller skrevet ut og lagt i en safe) – uten den er ALL data på disken
   uopprettelig tapt om innloggingspassordet glemmes eller kontoen
   korrumperes.

## 6. Avbruddsfri strømforsyning (UPS)

En UPS (avbruddsfri strømforsyning) beskytter mot at PostgreSQL avsluttes
brått midt i en skriveoperasjon ved strømbrudd (kan i verste fall korrumpere
databasen, selv om WAL-loggen normalt beskytter mot dette):

1. Koble Mac mini-en til en UPS med USB-tilkobling til Mac-en (de fleste
   forbruker-UPS-er fra f.eks. APC støtter dette).
2. **Systeminnstillinger → Energisparing → UPS**-fanen (vises når en UPS er
   tilkoblet via USB) lar deg sette opp automatisk, skånsom nedstenging når
   UPS-batteriet er nesten tomt.
3. Kombinert med punkt 4 (start automatisk etter strømbrudd) starter Mac
   mini-en – og dermed CRM-et – opp igjen av seg selv når strømmen kommer
   tilbake.

## 7. Backup til et annet sted enn selve Mac mini-en

Appen tar automatisk backup ved hver oppstart og minst én gang i døgnet mens
den kjører, med 30 dagers rotasjon (DR-06, se `electron/README.md`). Disse
backupene ligger derimot **på samme disk** som selve dataene, og beskytter
derfor IKKE mot at selve disken/Mac mini-en ødelegges, blir stjålet, eller
brenner opp. Sett i tillegg opp én av:

- **Time Machine** til en ekstern disk eller nettverksdisk, som tar med hele
  datamappen (inkludert `backups`-undermappen).
- En jevnlig synkronisering av datamappens `backups`-undermappe til en NAS
  eller skytjeneste (f.eks. med `rsync` i en cron-jobb, eller en
  synk-klient).

Datamappens plassering vises i kontrollpanelet sitt **Vis logger**-valg (i
samme foreldremappe), eller er som standard `~/Library/Application
Support/Pietra Unica CRM`.

## 8. Fast lokal IP-adresse

Alle på kontornettet kobler til CRM-et via `http://<mac-mini-ens
IP-adresse>:3000`. Sett opp en **DHCP-reservasjon** for Mac mini-en i
ruteren (bruker samme IP hver gang basert på Mac-ens MAC-adresse), slik at
denne adressen ikke endrer seg etter en omstart eller strømbrudd og alle
slipper å oppdatere bokmerker.

## 9. Manuell launchd-registrering (kun hvis automatisk registrering feiler)

Installasjonsveiviseren registrerer normalt appen i launchd automatisk når
servermodus velges (DR-12). Hvis dette skulle feile, viser appen en
feilmelding om det – registrer da manuelt i Terminal:

```bash
# Finn full sti til selve app-programmet (bytt ut med riktig sti om appen ligger et annet sted):
EXEC="/Applications/Pietra Unica CRM.app/Contents/MacOS/Pietra Unica CRM"

mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/no.marmor.pietraunica.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>no.marmor.pietraunica</string>
  <key>ProgramArguments</key>
  <array>
    <string>$EXEC</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
</dict>
</plist>
PLIST

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/no.marmor.pietraunica.plist
```

For å fjerne registreringen igjen (f.eks. før en avinstallasjon):

```bash
launchctl bootout gui/$(id -u)/no.marmor.pietraunica
rm ~/Library/LaunchAgents/no.marmor.pietraunica.plist
```

For å sjekke om den er registrert og kjører:

```bash
launchctl print gui/$(id -u)/no.marmor.pietraunica
```

`KeepAlive.SuccessfulExit` satt til `false` betyr at launchd IKKE starter
appen på nytt etter et vanlig **Avslutt** fra menylinjen (som avslutter med
en normal exit-kode), men DER derimot restarter den automatisk ved et ekte
krasj.

**IKKE verifisert av Claude i denne utviklingsøkten** (ingen macOS
tilgjengelig): selve launchd-registreringen og restart-ved-krasj-oppførselen
er kun verifisert ved kodelesning mot Apple sin `launchd.plist(5)`-
dokumentasjon og med en falsk (mock) `launchctl`-kommando i et testoppsett
(se `electron/README.md`), ikke ved faktisk kjøring mot en ekte launchd.
