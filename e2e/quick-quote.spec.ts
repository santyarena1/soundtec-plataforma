import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";
import { pickProduct } from "./picker";

const { sku, includedSku, perUnit } = FIXTURES.withIncluded;

const addBySku = pickProduct;

const rows = (page: import("@playwright/test").Page) => page.locator("table tbody tr");
const rowFor = (page: import("@playwright/test").Page, code: string) => rows(page).filter({ hasText: code });

test.describe("cotización rápida", () => {
  test.use({ storageState: AUTH_FILES.admin });

  test("lo incluido sigue la cantidad del producto y la cantidad es entera", async ({ page }) => {
    await page.goto("/admin/quotes/quick", { waitUntil: "networkidle" });
    await addBySku(page, sku);
    await expect(rowFor(page, includedSku)).toContainText("Incluido sin cargo");
    const qty = rowFor(page, sku).first().locator('input[type="number"]').first();
    await expect(qty).toHaveAttribute("step", "1");
    await qty.fill("2");
    await expect(rowFor(page, includedSku).locator('input[type="number"]').first()).toHaveValue(String(2 * perUnit));
    // La línea incluida no se edita a mano: sigue al producto.
    await expect(rowFor(page, includedSku).locator('input[type="number"]').first()).toBeDisabled();
    // Total por línea y «Sin cargo» en la incluida.
    await expect(page.locator("th", { hasText: "Total línea" })).toBeVisible();
    await expect(rowFor(page, includedSku)).toContainText("Sin cargo");
  });

  test("se puede repetir un producto en otra línea (ej. uno incluido y otro cobrado)", async ({ page }) => {
    await page.goto("/admin/quotes/quick", { waitUntil: "networkidle" });
    await addBySku(page, sku);
    await addBySku(page, includedSku);
    // El incluido aparece dos veces: sin cargo (por el producto) y cobrado (agregado a mano).
    await expect(rowFor(page, includedSku)).toHaveCount(2);
    const paid = rowFor(page, includedSku).nth(1);
    await expect(paid.locator('input[type="number"]').nth(1)).toBeEnabled();
    // Quitar el producto principal se lleva su incluido, no la línea cobrada.
    await rowFor(page, sku).filter({ hasNotText: "Incluido" }).first().getByRole("button", { name: "Quitar" }).click();
    await expect(rowFor(page, includedSku)).toHaveCount(1);
  });
});

test.describe("vendedor", () => {
  test.use({ storageState: AUTH_FILES.seller });

  test("el vendedor puede emitir desde la rápida", async ({ page }) => {
    await page.goto("/admin/quotes/quick", { waitUntil: "networkidle" });
    await addBySku(page, sku);
    await expect(page.getByRole("button", { name: "Crear y emitir PDF" })).toBeVisible();
  });
});
