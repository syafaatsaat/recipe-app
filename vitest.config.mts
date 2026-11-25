import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // pure unit tests: no DB, no network
      { test: { name: "unit", include: ["lib/**/*.test.ts"] } },
      // integration tests against local Supabase (`npx supabase start` first)
      { test: { name: "db", include: ["db/**/*.test.ts"], testTimeout: 15_000 } },
    ],
  },
});
