import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // DB tests run against an in-memory PGlite (embedded Postgres) — never a real DATABASE_URL.
    env: { PGLITE_DIR: "memory://", DATABASE_URL: "", POSTGRES_URL: "" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
