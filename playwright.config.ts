import { defineConfig } from "@playwright/test";

const PORT = 3120;
// E2E_DATABASE_URL (an EMPTY database) runs the suite against real Postgres; otherwise embedded PGlite in data/e2e.
const dbEnv = process.env.E2E_DATABASE_URL ? `DATABASE_URL=${process.env.E2E_DATABASE_URL}` : "DB_DIR=data/e2e";
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
    command: `rm -rf data/e2e data/e2e-mail.jsonl && ${dbEnv} npm run seed && ${dbEnv} EMAIL_TRANSPORT=file EMAIL_FILE=data/e2e-mail.jsonl npx next start -p ${PORT}`,
    port: PORT,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
