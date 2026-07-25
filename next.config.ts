import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @resvg/resvg-js ships a native .node binary per platform. Without this the
  // bundler tries to bundle it and the build fails -- it must stay external and
  // be resolved at runtime. Used by the chart image route to rasterize
  // server-rendered roughjs SVG to PNG for the Discord bot.
  serverExternalPackages: ['@resvg/resvg-js'],
  // resvg loads fonts from PATHS on disk (`fontFiles`), and it is configured
  // with `loadSystemFonts: false` because a Lambda has essentially no system
  // fonts. Next's tracer cannot see a runtime `path.join(process.cwd(), ...)`,
  // so without this the vendored TTFs are left behind and the classic failure
  // appears: correct in `next dev`, blank/fallback text in production.
  //
  // Narrowed to the chart image route (src/app/api/chart/[chart]/route.ts) --
  // it is the only entry point that rasterizes. The key is a glob matched
  // against build entry paths, and `**` is used rather than the literal
  // `/api/chart/[chart]/route` because square brackets are a character class
  // in a glob pattern and would not match the literal dynamic segment.
  // Verify after `npm run build` with:
  //   grep -o '[^"]*\.ttf' '.next/server/app/api/chart/[chart]/route.js.nft.json'
  outputFileTracingIncludes: {
    '/api/chart/**': ['./src/lib/charts/fonts/*.ttf'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
        pathname: '/i/teamlogos/**',
      },
      {
        protocol: 'http',
        hostname: 'a.espncdn.com',
        pathname: '/i/teamlogos/**',
      },
    ],
  },
};

export default nextConfig;
