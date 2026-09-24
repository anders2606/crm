// DR-13: bunter installatørens engangsoppgaver (opprett admin, lagre
// PowerOffice-nøkler) til én frittstående JS-fil, samme mønster som
// build-worker.mjs.
import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/installer-tasks.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist-worker/installer-tasks.js',
  external: ['@prisma/client', '.prisma/client'],
  logLevel: 'info',
});
