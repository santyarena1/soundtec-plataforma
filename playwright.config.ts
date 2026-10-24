import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra un servidor ya levantado (`next dev` o un deploy de prueba).
 * Nunca contra producción: los tests crean y modifican datos.
 *
 *   E2E_BASE_URL=http://localhost:3217 npx playwright test
 *
 * Credenciales de prueba: QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD y
 * QA_SELLER_EMAIL / QA_SELLER_PASSWORD (en .env.devbranch, fuera de git).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3217";
if (/soundtecportal\.com\.ar|vercel\.app/.test(baseURL)) {
  throw new Error("Los E2E no corren contra producción.");
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-AR",
    navigationTimeout: 120_000,
    actionTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
