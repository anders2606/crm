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
  },
};

export default nextConfig;
