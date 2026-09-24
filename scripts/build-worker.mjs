// DR-10: bunter workeren (src/worker/index.ts) til én frittstående JS-fil
// for pakking i Electron-appen (M9) – kjøres direkte i Electron sin egne
// Node-kjøretid, ingen tsx/ts-node-avhengighet i den pakkede appen.
// @prisma/client holdes utenfor bunten (external) fordi den lener seg på
// en generert spørremotor-binærfil i node_modules/.prisma/client, som må
// kopieres ved siden av bunten (se electron/package.json "extraResources").
import { build } from 'esbuild';

await build({
  entryPoints: ['src/worker/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist-worker/worker.js',
  external: ['@prisma/client', '.prisma/client'],
  logLevel: 'info',
});
