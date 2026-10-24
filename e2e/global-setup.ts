import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { SHIPPED_ADMIN_CHANGELOG } from "../src/data/admin-changelog";
import { CHANGELOG_SEEN_KEY } from "../src/lib/changelog-seen";

/** Inicia sesión una vez por rol y guarda la sesión para los tests. */
export const AUTH_FILES = { admin: "e2e/.auth/admin.json", seller: "e2e/.auth/seller.json" } as const;

async function login(baseURL: string, email: string, password: string, file: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  page.setDefaultTimeout(120_000);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /iniciar sesi/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  // El tutorial de bienvenida tapa la pantalla: se descarta (queda guardado en el usuario).
  await page.goto("/admin");
  const skip = page.getByRole("button", { name: "Ahora no" });
  if (await skip.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await skip.click();
    await page.waitForLoadState("networkidle");
  }
  // Las novedades ya vistas: el aviso no tapa la pantalla en los tests.
  await page.evaluate(
    ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
    [CHANGELOG_SEEN_KEY, SHIPPED_ADMIN_CHANGELOG.map((entry) => entry.id)] as const
  );
  await page.context().storageState({ path: file });
  await browser.close();
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  const need = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error(`Falta ${key} (ver .env.devbranch).`);
    return value;
  };
  mkdirSync("e2e/.auth", { recursive: true });
  await login(baseURL, need("QA_ADMIN_EMAIL"), need("QA_ADMIN_PASSWORD"), AUTH_FILES.admin);
  await login(baseURL, need("QA_SELLER_EMAIL"), need("QA_SELLER_PASSWORD"), AUTH_FILES.seller);
}
