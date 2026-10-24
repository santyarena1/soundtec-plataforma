import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";
import { pickProduct } from "./picker";

test.use({ storageState: AUTH_FILES.admin });

test("borrador desde la rápida → condiciones editadas se guardan y la COT se puede emitir con cliente escrito a mano", async ({ page }) => {
  await page.goto("/admin/quotes/quick", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Ej. Hotel Alvear").fill("Cliente E2E sin alta");
  await pickProduct(page, FIXTURES.withIncluded.sku);
  await page.getByRole("button", { name: "Guardar como borrador y abrir el editor" }).click();
  await page.waitForURL(/\/admin\/quotes\/[^/?]+\?paso=4/, { timeout: 120_000 });
  const quoteUrl = page.url().split("?")[0]!;

  // El incluido figura «sin cargo» y no dispara el aviso de fila sin precio.
  await expect(page.getByText("Incluido sin cargo").first()).toBeVisible();

  await page.goto(`${quoteUrl}?paso=6`, { waitUntil: "networkidle" });
  await page.locator("#paymentTerms").fill("50% anticipo, saldo contra entrega");
  await page.locator("#deliveryText").fill("10 días hábiles");
  await page.locator("#validityDays").fill("12");
  await page.getByRole("button", { name: "Guardar condiciones" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#paymentTerms")).toHaveValue("50% anticipo, saldo contra entrega");
  await expect(page.locator("#deliveryText")).toHaveValue("10 días hábiles");
  await expect(page.locator("#validityDays")).toHaveValue("12");
  await expect(page.locator("#termsSource")).toHaveValue("CUSTOM");

  // Con el cliente escrito a mano ya no aparece «Falta asignar cliente».
  await expect(page.getByText(/Falta asignar cliente|Falta el cliente/)).toHaveCount(0);
});
