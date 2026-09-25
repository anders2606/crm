// DR-12: i servermodus skal kontrollpanelet registreres i macOS launchd,
// slik at det starter automatisk og restartes selv ved krasj – uten at noen
// på kontoret trenger å åpne det manuelt eller overvåke at det fortsatt
// kjører.
//
// Registreres som et LaunchAgent (~/Library/LaunchAgents), IKKE et
// LaunchDaemon (/Library/LaunchDaemons): et LaunchDaemon kjører som root
// UTEN tilgang til WindowServer/GUI-sesjonen og ville aldri klart å vise et
// menylinje-ikon (DR-11) i det hele tatt. Dette forutsetter at Mac
// mini-en er satt opp med AUTOMATISK INNLOGGING (se
// docs/mac-mini-oppsett.md, DR-17) – et LaunchAgent starter først når
// brukerens GUI-sesjon starter, ikke ved selve strømpåslag.
//
// `KeepAlive.SuccessfulExit: false` betyr «ikke restart ved et rent/vellykket
// avslutt (exit-kode 0), men RESTART ved krasj (exit-kode ≠ 0 eller drept av
// et signal)» – slik at «Avslutt» i menylinjen (tray.ts) faktisk avslutter
// appen, mens et ekte krasj fortsatt restartes automatisk.
//
// IKKE VERIFISERT av Claude i denne utviklingsøkten: launchctl finnes ikke på
// Linux. Selve plist-strukturen og rekkefølgen på launchctl-kallene er
// verifisert mot Apple sin launchd.plist(5)-dokumentasjon og med en
// falsk (mock) launchctl-kommando i et testoppsett (se README), ikke ved
// faktisk registrering mot en ekte launchd.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';

// Samme streng som "appId" i package.json sin "build"-seksjon (electron-builder).
export const LAUNCH_AGENT_LABEL = 'no.marmor.pietraunica';

export function getLaunchAgentPath(): string {
  return path.join(homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildLaunchAgentPlist(executablePath: string, logsDir: string): string {
  const outLog = xmlEscape(path.join(logsDir, 'launchd.log'));
  const errLog = xmlEscape(path.join(logsDir, 'launchd-error.log'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(executablePath)}</string>
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
  <key>StandardOutPath</key>
  <string>${outLog}</string>
  <key>StandardErrorPath</key>
  <string>${errLog}</string>
</dict>
</plist>
`;
}

function launchctl(...args: string[]): void {
  execFileSync('launchctl', args, { stdio: 'pipe' });
}

/**
 * Registrerer (eller re-registrerer, ved f.eks. en reinstallasjon) appen som
 * et LaunchAgent. Kalles fra installasjonsveiviseren (DR-13) når brukeren
 * velger servermodus. IKKE ment kalt gjentatte ganger ved vanlig oppstart –
 * kun ved førstegangsoppsett.
 */
export function registerLaunchAgent(executablePath: string, logsDir: string): void {
  const plistPath = getLaunchAgentPath();
  mkdirSync(path.dirname(plistPath), { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  // Trygt å kalle selv om den ikke er registrert fra før (bootout feiler da
  // stille, se unregisterLaunchAgent) – unngår en «already bootstrapped»-feil
  // fra launchctl ved en reinstallasjon på samme Mac.
  unregisterLaunchAgent();

  writeFileSync(plistPath, buildLaunchAgentPlist(executablePath, logsDir), 'utf8');

  const uid = userInfo().uid;
  launchctl('bootstrap', `gui/${uid}`, plistPath);
}

export function unregisterLaunchAgent(): void {
  const plistPath = getLaunchAgentPath();
  if (!existsSync(plistPath)) {
    return;
  }
  const uid = userInfo().uid;
  try {
    launchctl('bootout', `gui/${uid}/${LAUNCH_AGENT_LABEL}`);
  } catch {
    // Allerede lastet ut (eller aldri lastet inn i denne GUI-sesjonen) –
    // uansett greit, målet (ikke registrert) er nådd.
  }
  unlinkSync(plistPath);
}
