import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";

test.use({ storageState: AUTH_FILES.admin });

const productUrl = `/admin/products/${FIXTURES.editableProductId}`;
type Page = import("@playwright/test").Page;

async function save(page: Page) {
  // Espera la respuesta del guardado (server action), no solo que la red quede quieta.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/products/"));
  await page.getByRole("button", { name: "Guardar cambios" }).first().click();
  await saved;
  await page.waitForLoadState("networkidle");
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name });

test("solapas: cada sección en su lugar y la solapa va en la URL", async ({ page }) => {
  await page.goto(productUrl, { waitUntil: "networkidle" });
  await expect(tab(page, "General")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#internalSku")).toBeVisible();
  await expect(page.locator("#ivaPercentDisplay")).toBeHidden();

  await tab(page, "Precio y costos").click();
  await expect(page.locator("#ivaPercentDisplay")).toBeVisible();
  await expect(page.locator("#internalSku")).toBeHidden();
  await expect(page).toHaveURL(/solapa=precio/);

  await page.reload({ waitUntil: "networkidle" });
  await expect(tab(page, "Precio y costos")).toHaveAttribute("aria-selected", "true");

  await tab(page, "Imágenes").click();
  await expect(page.locator('[data-tour="product-images"]')).toBeVisible();
  await tab(page, "Relaciones").click();
  await expect(page.locator('[data-tour="product-options"]')).toBeVisible();
  await expect(page.locator('[data-tour="product-accessories"]')).toBeVisible();
});

test("un cambio en otra solapa se guarda igual, con aviso de cambios sin guardar", async ({ page }) => {
  await page.goto(`${productUrl}?solapa=precio`, { waitUntil: "networkidle" });
  await page.locator("#ivaPercentDisplay").selectOption("0");
  await expect(page.getByText("Cambios sin guardar")).toBeVisible();
  // Se cambia de solapa antes de guardar: el valor no se pierde.
  await tab(page, "General").click();
  await save(page);
  // Guardado de verdad: el aviso desaparece cuando el servidor confirma.
  await expect(page.getByText("Cambios sin guardar")).toHaveCount(0, { timeout: 60_000 });
  await page.goto(`${productUrl}?solapa=precio`, { waitUntil: "networkidle" });
  await expect(page.locator("#ivaPercentDisplay")).toHaveValue("0");
  await expect(page.getByText("Cambios sin guardar")).toHaveCount(0);
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

test("relaciones: incluido en la caja con cantidad, editar y quitar", async ({ page }) => {
  await page.goto(`${productUrl}?solapa=relaciones`, { waitUntil: "networkidle" });
  const included = page.locator("section").filter({ has: page.getByRole("heading", { name: "Incluido en la caja" }) });
  await included.getByPlaceholder("Buscá por nombre, SKU o marca").fill(FIXTURES.withIncluded.includedSku);
  await included.locator('input[type="number"]').last().fill("3");
  const linked = page.waitForResponse((r) => r.request().method() === "POST");
  await included.getByRole("button", { name: "Agregar" }).first().click();
  await linked;
  const row = included.locator("li").filter({ hasText: FIXTURES.withIncluded.includedSku }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('input[type="number"]')).toHaveValue("3");

  await row.locator('input[type="number"]').fill("2");
  const updated = page.waitForResponse((r) => r.request().method() === "POST");
  await row.locator('input[type="number"]').blur();
  await updated;
  await page.waitForLoadState("networkidle");
  await page.reload({ waitUntil: "networkidle" });
  const again = page.locator("section").filter({ has: page.getByRole("heading", { name: "Incluido en la caja" }) }).locator("li").filter({ hasText: FIXTURES.withIncluded.includedSku }).first();
  await expect(again.locator('input[type="number"]')).toHaveValue("2");

  page.once("dialog", (dialog) => dialog.accept());
  await again.getByRole("button", { name: /Quitar/ }).click();
  await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Incluido en la caja" }) }).locator("li").filter({ hasText: FIXTURES.withIncluded.includedSku })).toHaveCount(0);
});
