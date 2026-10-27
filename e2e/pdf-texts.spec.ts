import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";
import { pickProduct } from "./picker";

test.use({ storageState: AUTH_FILES.admin });

const LABEL = `E2E Hotelería ${Date.now().toString(36)}`;
const MARK = "Texto de prueba para hoteles y restaurantes.";

test("textos del PDF: una versión para un rubro sale sola en la cotización de ese rubro", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/admin/settings/quotes/textos", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Textos del PDF" }).getByRole("button", { name: /Presentación/ }).click();

  // Crear la versión con condición de rubro.
  await page.getByRole("tab", { name: /Nueva versión/ }).click();
  await page.getByLabel("Nombre de la versión").fill(LABEL);
  await page.getByRole("button", { name: "Hotelería y gastronomía" }).first().click();
  const editor = page.locator(".ProseMirror").first();
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(MARK);
  await expect(page.getByText("Así sale en el PDF").locator("..")).toContainText(MARK);
  await page.getByRole("button", { name: "Crear versión" }).click();
  await expect(page.getByRole("tab", { name: LABEL })).toBeVisible({ timeout: 60_000 });

  // «Probar» elige la versión sólo con ese rubro.
  const result = page.getByTestId("try-result");
  await expect(result).toContainText("Texto general");
  await page.getByLabel("Rubro para probar").selectOption("hoteleria");
  await expect(result).toContainText(LABEL);

  // Una cotización para Hotelería la toma sola.
  await page.goto("/admin/quotes/quick", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Ej. Hotel Alvear").fill("Hotel E2E");
  await pickProduct(page, FIXTURES.withIncluded.sku);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.waitForURL(/\/admin\/quotes\/quick\?editar=/, { timeout: 120_000 });
  const quoteUrl = `/admin/quotes/${new URL(page.url()).searchParams.get("editar")}`;
  await page.goto(`${quoteUrl}?paso=1`, { waitUntil: "networkidle" });
  await page.getByLabel("A quién va").selectOption("hoteleria");
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await page.waitForURL(/paso=2/, { timeout: 180_000 });
  await page.goto(`${quoteUrl}?paso=3`, { waitUntil: "networkidle" });
  // Otra corrida contra la misma base puede haber creado una versión de Hotelería más nueva: alcanza con que elija una de Hotelería.
  await expect(page.locator("select").filter({ has: page.locator('option:text-matches("^Automática \\\\(hoy: E2E Hotelería")') })).toHaveCount(1);

  // Limpieza: borrar la versión.
  await page.goto("/admin/settings/quotes/textos", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Textos del PDF" }).getByRole("button", { name: /Presentación/ }).click();
  await page.getByRole("tab", { name: LABEL }).click();
  await page.getByRole("button", { name: "Eliminar versión" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("tab", { name: LABEL })).toHaveCount(0, { timeout: 60_000 });
});
