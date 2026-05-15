/** @type {import('next').NextConfig} */
//
// Node 5.D.3 — perf check.
//
// `optimizePackageImports` makes Next/Turbopack split the named HeroUI
// exports into per-component import paths at build time, dropping the
// barrel-file dead code that the full `@heroui/react` import otherwise
// pulls in. Same treatment for `lightweight-charts` so the chart wrapper
// only pays for the modules it actually uses.
//
// `productionBrowserSourceMaps` defaults to false; we set it explicitly
// so future Wave 5 commits that flip Vercel-style settings won't expose
// our minified source maps in production.
const nextConfig = {
  // `standalone` emits .next/standalone with a tree-shaken node_modules
  // copy so the production Docker image can ship ~150MB total instead
  // of ~1GB. See client/Dockerfile for how it's consumed.
  output: "standalone",
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: ["@heroui/react", "lightweight-charts"],
  },
};

export default nextConfig;
