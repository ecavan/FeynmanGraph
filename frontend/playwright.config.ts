import { defineConfig } from "@playwright/test";

/**
 * Playwright runs against the Vite dev server (npm run dev → http://localhost:5173).
 * The Vite dev server proxies /api/* to http://localhost:8000 — so the backend
 * `feyngraph serve` must be running separately in another terminal for the
 * E2E tests to pass.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
