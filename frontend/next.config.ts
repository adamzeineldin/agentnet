import type { NextConfig } from "next";

// NEXT_OUTPUT=export builds static files that the backend serves in the single-container cloud image.
// Partial prerendering cannot run in export mode, so Cache Components is turned off there.
const exporting = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  // Playwright builds into a separate dir so it never collides with `next dev` (.next).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: exporting ? "export" : undefined,
  cacheComponents: !exporting,
  partialPrefetching: !exporting,
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
