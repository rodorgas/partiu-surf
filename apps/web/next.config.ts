import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    forecastFresh: {
      stale: 60,
      revalidate: 3600,
      expire: 86400,
    },
    forecastArchive: {
      stale: 300,
      revalidate: 60 * 60 * 24 * 30,
      expire: 60 * 60 * 24 * 365,
    },
  },
};

export default nextConfig;
