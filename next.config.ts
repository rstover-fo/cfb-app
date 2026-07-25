import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @resvg/resvg-js ships a native .node binary per platform. Without this the
  // bundler tries to bundle it and the build fails -- it must stay external and
  // be resolved at runtime. Used by the chart image route to rasterize
  // server-rendered roughjs SVG to PNG for the Discord bot.
  serverExternalPackages: ['@resvg/resvg-js'],
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
