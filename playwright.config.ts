import { defineConfig, devices } from "@playwright/test";

// End-to-end flows against `pnpm dev` and the local Supabase stack
// (`npx supabase start` and `pnpm db:reset` first).
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
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
