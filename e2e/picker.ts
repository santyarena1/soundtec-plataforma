import { expect, type Page } from "@playwright/test";

/** Busca en el buscador de productos único y toca «Agregar» en el resultado con ese código. */
export async function pickProduct(page: Page, code: string) {
  await page.getByPlaceholder("Buscá por modelo, marca o código").first().fill(code);
  const option = page.getByRole("option").filter({ hasText: code }).first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.getByRole("button", { name: "Agregar" }).click();
}
