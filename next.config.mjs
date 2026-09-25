/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // DO-01/DO-03 (M2): dokumenter (tegninger, bilder, PDF-er) lastes opp via
    // en server action. Standardgrensen på 1 MB er for lav for f.eks. en
    // 50 MB PDF (akseptansekriterium M2).
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // DR-10/DR-13: `output: 'standalone'` sin filsporing evaluerer
    // `process.cwd() + 'data/...'`-uttrykkene i src/lib/storage.ts og
    // src/lib/backup.ts ved BYGGETIDSPUNKTET (da er cwd repo-roten), og tar
    // da med HELE innholdet av ./data/documents og ./data/backups slik det
    // ser ut akkurat da – dvs. ekte kundedokumenter/-backuper fra en
    // utviklers lokale `npm run dev` kunne havnet i .next/standalone og
    // dermed i den pakkede DMG-en. Oppdaget under et testbygg av M9 (Electron
    // sin dist:mac). Selve appen leser aldri disse via STORAGE_DIR/BACKUP_DIR
    // ved kjøring (electron/src/main.ts setter alltid disse til datamappen,
    // se paths.ts) – ./data/ her er kun for utvikling, og skal ALDRI havne i
    // et bygg.
    outputFileTracingExcludes: {
      '*': ['./data/**/*'],
    },
  },
};

export default nextConfig;
