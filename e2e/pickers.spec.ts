import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";

/** El buscador de productos único se ve y se usa igual en cada pantalla (sin guardar nada). */
test.use({ storageState: AUTH_FILES.admin });

const code = FIXTURES.withIncluded.sku;

test("listas compartidas: elegir un producto lo marca «ya agregado» y aparece arriba para sacarlo", async ({ page }) => {
  await page.goto("/admin/share-lists/new", { waitUntil: "networkidle" });
  const box = page.locator("div.rounded-lg").filter({ has: page.getByText("Productos específicos", { exact: true }) }).last();
  await box.getByPlaceholder("Buscá por modelo, marca o código").fill(code);
  const option = box.getByRole("option").filter({ hasText: code }).first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.getByRole("button", { name: "Agregar" }).click();
  await expect(option).toContainText("ya agregado");
  await expect(box.getByRole("button", { name: /^Sacar / })).toHaveCount(1);
});

test("pedido: sugerir producto busca con foto y precio, y «Elegir» pasa a confirmar", async ({ page }) => {
  await page.goto("/admin/requests", { waitUntil: "networkidle" });
  const hrefs = await page.locator('a[href^="/admin/requests/"]').evaluateAll((els) => [...new Set(els.map((a) => a.getAttribute("href")!))].slice(0, 8));
  const suggest = page.getByRole("button", { name: /Sugerir producto/ }).first();
  let found = false;
  for (const href of hrefs) {
    await page.goto(href, { waitUntil: "networkidle" });
    if (await suggest.count()) { found = true; break; }
  }
  test.skip(!found, "Ningún pedido abierto en la rama de prueba.");
  await suggest.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Buscá por modelo, marca o código").fill(code);
  const option = dialog.getByRole("option").filter({ hasText: code }).first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.getByRole("button", { name: "Elegir" }).click();
  await expect(dialog.getByText("Confirmá la sugerencia")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("expo: elegir una marca muestra sus productos sin escribir", async ({ page }) => {
  await page.goto("/admin/settings/expo", { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/admin/settings/expo/"]').first().getAttribute("href").catch(() => null);
  test.skip(!href, "La rama de prueba no tiene eventos de Expo.");
  await page.goto(href!, { waitUntil: "networkidle" });
  const brand = page.getByLabel("Marca", { exact: true });
  test.skip((await brand.count()) === 0, "El evento no tiene vidriera.");
  const firstBrand = await brand.locator("option").nth(1).getAttribute("value");
  await brand.selectOption(firstBrand!);
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible({ timeout: 30_000 });
});
