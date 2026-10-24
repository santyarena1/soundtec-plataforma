import { test as base, expect } from "@playwright/test";

/**
 * `test` con el tutorial de bienvenida descartado solo: si aparece y tapa la
 * pantalla, se toca «Ahora no» y el test sigue.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(page.getByRole("button", { name: "Ahora no" }), async (button) => {
      await button.click();
    });
    await page.addLocatorHandler(page.getByRole("button", { name: "Entendido" }), async (button) => {
      await button.click();
    });
    await use(page);
  },
});

export { expect };
