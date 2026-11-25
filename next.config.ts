import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres plus data files; load it from node_modules
  // at runtime instead of bundling it. (It's only used locally, when DATABASE_URL is unset.)
  serverExternalPackages: ["@electric-sql/pglite"],
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
