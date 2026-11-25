import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // same "@/…" alias as tsconfig.json
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    projects: [
      // pure unit tests: no DB, no network
      { extends: true, test: { name: "unit", include: ["lib/**/*.test.ts"] } },
      // integration tests against local Supabase (`npx supabase start` first)
      { extends: true, test: { name: "db", include: ["db/**/*.test.ts"], testTimeout: 15_000 } },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/culinary/**/*.ts", "lib/recipes/**/*.ts"],
      exclude: ["**/*.test.ts", "lib/culinary/fixtures.ts", "lib/culinary/index.ts"],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
