import { defineConfig, devices } from "@playwright/test";

// End-to-end flows against `pnpm dev` and the local Supabase stack
// (`npx supabase start` and `pnpm db:reset` first).
/** hand-written recipe pages for the import flows (e2e/fixture-server.mjs) */
export const FIXTURE_HOST = "127.0.0.1:4010";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  // `next dev` compiles each route on its first visit, which can take longer than
  // the 5 s default on a cold .next cache
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    // phone first (doc §8): iPhone-sized viewport, Chromium engine
    { name: "phone", use: { ...devices["iPhone 15"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    {
      // IMPORT_ALLOW_HOSTS lets the importer fetch the fixture sites below (never in production);
      // ANTHROPIC_BASE_URL sends the AI fallback to the fixture server's mock, with a dummy key.
      // A dev server you started yourself is reused: start it with the same variables.
      command: "pnpm dev",
      url: "http://localhost:3000/login",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { IMPORT_ALLOW_HOSTS: FIXTURE_HOST, ANTHROPIC_BASE_URL: `http://${FIXTURE_HOST}`, ANTHROPIC_API_KEY: "e2e-mock" },
    },
    {
      command: "node e2e/fixture-server.mjs",
      url: `http://${FIXTURE_HOST}/health`,
      reuseExistingServer: true,
    },
  ],
});
