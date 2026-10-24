import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

test.use({ storageState: AUTH_FILES.admin });

test("listado de cotizaciones: desplegable con productos y acciones siempre a mano", async ({ page }) => {
  await page.goto("/admin/quotes", { waitUntil: "networkidle" });
  const first = page.locator("tbody tr").first();
  await expect(first.getByRole("link", { name: "Editar" })).toBeVisible();
  await expect(first.getByRole("link", { name: "PDF" })).toBeVisible();
  await expect(first.getByRole("button", { name: "Ver" })).toBeVisible();
  // El PDF de un borrador abre el documento tal como está (no hace falta emitir).
  const href = await first.getByRole("link", { name: "PDF" }).getAttribute("href");
  expect(href).toMatch(/\/api\/(admin\/quotes\/[^/]+\/preview-pdf|quotes\/[^/]+\/pdf)$/);
  await first.click();
  await expect(page.getByRole("term").filter({ hasText: /^Cliente$/ })).toBeVisible();
  await expect(page.getByRole("term").filter({ hasText: /^Neto$/ })).toBeVisible();
  // Otro clic lo cierra.
  await first.click();
  await expect(page.getByText("Neto", { exact: true })).toHaveCount(0);
});
