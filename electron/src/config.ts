// DR-12/DR-13: liten innstillingsfil i datamappen som husker hvilken modus
// (lokal/server) og hvilket oppsett installasjonsveiviseren valgte, slik at
// kontrollpanelet vet hva det skal gjøre ved neste oppstart uten å spørre
// på nytt.
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getConfigFilePath } from './paths';

export type AppMode = 'local' | 'server';

export interface AppConfig {
  mode: AppMode;
  setupComplete: boolean;
  postgresPort: number;
  webPort: number;
  /** DR-14: siste versjon appen ble startet med – brukes til å oppdage en oppgradering. */
  lastKnownVersion: string | null;
}

const DEFAULT_CONFIG: AppConfig = {
  mode: 'local',
  setupComplete: false,
  postgresPort: 55432,
  webPort: 3000,
  lastKnownVersion: null,
};

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(getConfigFilePath(), 'utf8');
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  const filePath = getConfigFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
}
