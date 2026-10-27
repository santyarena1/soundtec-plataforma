import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/** «A quién va»: se crea en Configuración, se elige en la cotización y «Agregar…» lleva a Configuración. */
const prisma = new PrismaClient();
const LABEL = `E2E Público ${Date.now().toString(36)}`;
test.use({ storageState: AUTH_FILES.admin });
test.afterAll(async () => {
  await prisma.quoteAudience.deleteMany({ where: { label: LABEL } });
  await prisma.$disconnect();
});

test("crear un público, elegirlo en la rápida y volver a Configuración desde el selector", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/admin/settings/quotes#a-quien-va", { waitUntil: "networkidle", timeout: 120_000 });
  const section = page.locator("#a-quien-va");
  // Sin ninguno creado el formulario ya está abierto; si no, se abre con «Agregar».
  if (!(await section.locator("#aud-label").isVisible())) await section.getByRole("button", { name: "Agregar" }).click();
  await section.locator("#aud-label").fill(LABEL);
  await section.locator("#aud-focus").fill("clientes de prueba");
  await section.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(section.getByText(LABEL)).toBeVisible({ timeout: 30_000 });
  const created = await prisma.quoteAudience.findFirst({ where: { label: LABEL } });
  expect(created?.isActive).toBe(true);

  await page.goto("/admin/quotes/quick", { waitUntil: "networkidle", timeout: 120_000 });
  const select = page.locator("#qq-aud");
  await expect(select).toHaveValue("");
  await select.selectOption(created!.key);
  await expect(select).toHaveValue(created!.key);
  await select.selectOption({ label: "＋ Agregar a quién va…" });
  await page.waitForURL(/\/admin\/settings\/quotes/, { timeout: 60_000 });
});
