import { defineConfig } from "@playwright/test";

const PORT = 3120;
export default defineConfig({
  testDir: "e2e",
  workers: 1, // one embedded DB, tests share state deliberately
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Locally the sandbox ships its own Chromium; in CI use Playwright's (`npx playwright install chromium`).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `rm -rf data/e2e && DB_DIR=data/e2e npm run seed && DB_DIR=data/e2e npx next start -p ${PORT}`,
    port: PORT,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
