import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright builds into a separate dir so it never collides with `next dev` (.next).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
