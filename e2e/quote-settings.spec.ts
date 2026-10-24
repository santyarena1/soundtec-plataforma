import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

test.use({ storageState: AUTH_FILES.admin });

test("configuración de cotizaciones: solapas y un solo Guardar por tarjeta", async ({ page }) => {
  await page.goto("/admin/settings/quotes?solapa=condiciones", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Pago, entrega y garantía" })).toHaveAttribute("aria-selected", "true");
  const card = page.locator("form").filter({ hasText: "Pago, entrega y garantía" });
  const validity = card.locator('input[name="setting:quotes.terms.validity_days"]');
  const original = await validity.inputValue();
  const next = original === "9" ? "8" : "9";
  await validity.fill(next);
  await expect(card.getByText("Cambios sin guardar")).toBeVisible();
  await card.getByRole("button", { name: "Guardar" }).click();
  await expect(card.getByText("Guardado.")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator('input[name="setting:quotes.terms.validity_days"]')).toHaveValue(next);
  // (Fuera de rango lo frena el navegador: min/max del campo; el servidor también valida.)
  await page.locator('input[name="setting:quotes.terms.validity_days"]').fill(original);
  await page.locator("form").filter({ hasText: "Pago, entrega y garantía" }).getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator("form").filter({ hasText: "Pago, entrega y garantía" }).getByText("Guardado.")).toBeVisible();

  await page.getByRole("tab", { name: "Logos e imágenes" }).click();
  await expect(page.getByRole("heading", { name: "Logos de las marcas" })).toBeVisible();
  await expect(page.getByText("Subir imagen").first()).toBeVisible();
  await page.getByRole("tab", { name: "Número de cotización" }).click();
  await expect(page.getByText("La próxima cotización va a salir con el número")).toBeVisible();
});
