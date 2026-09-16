import { defineConfig, devices } from "@playwright/test";

// E2E smoke suite — Next 16 allows only ONE dev server per project dir, so we
// reuse whatever is already serving :3001 (or start it when absent).
// Not part of CI yet (browsers aren't in package.json deps); run locally with:
//   node_modules/.bin/playwright test
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Next 16 allows only ONE dev server per project dir — start it yourself
  // (`npm run dev -- -p 3001`) before running the suite.
});
