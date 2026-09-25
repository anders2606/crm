// DR-14: appen har ingen auto-oppdatering – brukeren laster ned og
// installerer en ny DMG manuelt over den gamle (DR-16). Selve
// "uten tap av data"-garantien er strukturell og allerede på plass:
// datamappen (database, dokumenter) ligger alltid UTENFOR .app-bunten
// (DR-02/DR-13), og en automatisk backup tas alltid FØR migreringer kjører,
// på ENHVER oppstart (DR-03) – inkludert altså den aller første oppstarten
// etter en oppdatering, uansett om den bringer med seg nye migreringer.
//
// Det som manglet var å faktisk OPPDAGE at dette skjedde, og gi brukeren en
// synlig bekreftelse på at oppdateringen gikk bra og at en backup ble tatt
// automatisk før den – uten dette skjer alt riktig, men usynlig.
import { Notification } from 'electron';

/**
 * Sammenligner forrige kjørte versjon (fra config.json, se `lastKnownVersion`)
 * mot den som kjører nå. `previousVersion` er `null` ved aller første
 * oppstart (ingen oppdatering å varsle om).
 */
export function notifyIfUpgraded(previousVersion: string | null, currentVersion: string): void {
  if (!previousVersion || previousVersion === currentVersion) {
    return;
  }

  console.log(
    `[main] Pietra Unica CRM oppdatert fra v${previousVersion} til v${currentVersion}. ` +
      'En backup ble tatt automatisk før migreringene kjørte (DR-03).',
  );

  if (Notification.isSupported()) {
    new Notification({
      title: 'Pietra Unica CRM oppdatert',
      body: `Oppdatert fra v${previousVersion} til v${currentVersion}. En backup ble tatt automatisk før oppdateringen.`,
    }).show();
  }
}
