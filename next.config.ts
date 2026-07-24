import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle (`node server.js`) for the Docker image.
  output: 'standalone',
  // Serve static assets (`/_next/static/**`) from the Nav CDN when `ASSET_PREFIX` is set.
  // The deploy workflow sets it at build time and uploads `.next/static` to the CDN, so
  // the rendered HTML references the assets there. Local builds leave it
  // unset, so Next serves the assets itself and the UI works without the CDN.
  assetPrefix: process.env.ASSET_PREFIX,
  // Type-checking is enforced by CI, skip Next's redundant in-build passes.
  typescript: { ignoreBuildErrors: true },
  // `@valkey/valkey-glide` ships a native `.node` addon; keep it external so it is `require`d
  // at runtime (and traced into the standalone output) instead of bundled by webpack.
  serverExternalPackages: ['@valkey/valkey-glide'],
  experimental: {
    useTypeScriptCli: true,
  },
};

export default nextConfig;
