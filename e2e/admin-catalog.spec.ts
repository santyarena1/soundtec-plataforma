import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

test.use({ storageState: AUTH_FILES.admin });

test("listado admin: stock en español, orden por defecto coherente y sin errores de hidratación", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /did not match|hydration/i.test(message.text())) errors.push(message.text());
  });
  await page.goto("/admin/products", { waitUntil: "networkidle" });
  const table = page.locator("table").first();
  await expect(table).toBeVisible();
  await expect(table).not.toContainText(/IN_STOCK|OUT_OF_STOCK|LOW_STOCK|ON_REQUEST/);
  // El selector de orden muestra lo mismo que ordena el servidor (Nombre A→Z).
  await expect(page.locator("select").filter({ hasText: "Nombre A→Z" }).first()).toHaveValue("name_asc");
  // El orden por costo se llama «Costo», no «Precio».
  await expect(page.locator("option", { hasText: "Costo ↑" })).toHaveCount(1);
  expect(errors).toEqual([]);
});
