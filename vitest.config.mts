import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { env: { SCRYPT_LOG_N: "10" }, include: ["tests/**/*.test.ts"], testTimeout: 30000 },
});
