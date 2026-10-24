import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";

test.use({ storageState: AUTH_FILES.admin });

const productUrl = `/admin/products/${FIXTURES.editableProductId}`;

async function save(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Guardar cambios" }).first().click();
  await page.waitForLoadState("networkidle");
}

test("IVA exento (0%) se guarda y vuelve como 0%, no 21%", async ({ page }) => {
  await page.goto(productUrl, { waitUntil: "networkidle" });
  const iva = page.locator("#ivaPercentDisplay");
  await iva.selectOption("0");
  await save(page);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.locator("#ivaPercentDisplay")).toHaveValue("0");
  // Se deja como estaba (vacío = el general).
  await page.locator("#ivaPercentDisplay").selectOption("21");
  await save(page);
});

test("un COD. TANGO repetido muestra un aviso y no rompe la página", async ({ page }) => {
  await page.goto(productUrl, { waitUntil: "networkidle" });
  const sku = page.locator("#internalSku");
  const original = await sku.inputValue();
  await sku.fill(FIXTURES.otherProductSku);
  await save(page);
  await expect(page.getByText("Ya hay otro producto con ese COD. TANGO.").first()).toBeVisible();
  await expect(page.locator("#internalSku")).toBeVisible();
  await sku.fill(original);
});
