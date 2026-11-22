import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";

/**
 * Aviso de «cambios sin guardar»: al irse por un enlace o con «atrás» aparece el
 * cuadro propio; «Seguir editando» deja todo como estaba; sin cambios (o después de
 * guardar) no pregunta nada.
 */

test.use({ storageState: AUTH_FILES.admin });

type Page = import("@playwright/test").Page;

const productUrl = `/admin/products/${FIXTURES.editableProductId}`;
const dialog = (page: Page) => page.getByRole("dialog").filter({ hasText: "Cambios sin guardar" });

async function openProduct(page: Page) {
  await page.goto(productUrl);
  await page.getByRole("tab", { name: "Comercio exterior" }).click();
  await expect(page.locator("#coo")).toBeVisible();
  // El host recién hidrata después del primer render: un respiro para que tome la foto inicial.
  await page.waitForTimeout(300);
}

test("ficha de producto: enlace y «atrás» avisan; «Seguir editando» mantiene lo escrito", async ({ page }) => {
  await page.goto("/admin/products");
  await openProduct(page);
  const coo = page.locator("#coo");
  const original = await coo.inputValue();
  const edited = `${original} prueba aviso`;
  await coo.fill(edited);
  await expect(page.getByText("Cambios sin guardar").first()).toBeVisible();

  // 1. Enlace interno → aviso → seguir editando.
  await page.getByRole("link", { name: /Volver al catálogo/ }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Seguir editando" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${FIXTURES.editableProductId}`));
  await expect(coo).toHaveValue(edited);

  // 2. Botón «atrás» del navegador → aviso → seguir editando.
  await page.goBack();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Seguir editando" }).click();
  await expect(page).toHaveURL(new RegExp(`${FIXTURES.editableProductId}`));
  await expect(coo).toHaveValue(edited);

  // 3. Volver al valor original = sin cambios: el enlace navega sin preguntar.
  await coo.fill(original);
  await expect(page.getByText("Cambios sin guardar")).toHaveCount(0);
  await page.getByRole("link", { name: /Volver al catálogo/ }).click();
  await expect(page).toHaveURL(/\/admin\/products(\?|$)/);
  await expect(dialog(page)).toHaveCount(0);
});

test("ficha de producto: «Salir sin guardar» sale; después de guardar no avisa", async ({ page }) => {
  await page.goto("/admin/products");
  await openProduct(page);
  const coo = page.locator("#coo");
  const original = await coo.inputValue();

  // «Atrás» + «Salir sin guardar» → vuelve al listado.
  await coo.fill(`${original} x`);
  await page.goBack();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page).toHaveURL(/\/admin\/products(\?|$)/);

  // Guardar y salir: sin aviso. Después se restaura el valor original.
  await openProduct(page);
  const edited = `${original} guardado`;
  try {
    await coo.fill(edited);
    await saveProduct(page);
    await expect(page.getByText("Cambios sin guardar")).toHaveCount(0);
    await page.getByRole("link", { name: /Volver al catálogo/ }).click();
    await expect(page).toHaveURL(/\/admin\/products(\?|$)/);
    await expect(dialog(page)).toHaveCount(0);
  } finally {
    await openProduct(page);
    if ((await coo.inputValue()) !== original) {
      await coo.fill(original);
      await saveProduct(page);
    }
  }
});

async function saveProduct(page: Page) {
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/products/"));
  await page.getByRole("button", { name: "Guardar cambios" }).first().click();
  await saved;
  await page.waitForLoadState("networkidle");
}

test("cerrar o recargar la pestaña con cambios: aviso nativo del navegador", async ({ page }) => {
  await openProduct(page);
  await page.locator("#coo").fill("cambio sin guardar");
  let asked = false;
  page.on("dialog", async (d) => {
    asked = d.type() === "beforeunload";
    await d.dismiss(); // quedarse
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked).toBe(true);
});

test("lista compartible nueva: botón «Cancelar», enlace del menú y «atrás» avisan solo con cambios", async ({ page }) => {
  await page.goto("/admin/share-lists");
  await page.goto("/admin/share-lists/new");
  const name = page.locator("#name");
  await expect(name).toBeVisible();
  await page.waitForTimeout(300);

  // Sin cambios: «Cancelar» sale directo.
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page).toHaveURL(/\/admin\/share-lists$/);
  await expect(dialog(page)).toHaveCount(0);

  // Con cambios: «Cancelar» (router.push de la app) pregunta.
  await page.goto("/admin/share-lists/new");
  await expect(name).toBeVisible();
  await page.waitForTimeout(300);
  await name.fill("Lista de prueba sin guardar");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Seguir editando" }).click();
  await expect(page).toHaveURL(/\/admin\/share-lists\/new/);
  await expect(name).toHaveValue("Lista de prueba sin guardar");

  // Enlace del menú lateral.
  await page.getByRole("link", { name: "Márgenes" }).first().click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Seguir editando" }).click();
  await expect(page).toHaveURL(/\/admin\/share-lists\/new/);

  // «Atrás» + salir sin guardar: vuelve al listado.
  await page.goBack();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page).toHaveURL(/\/admin\/share-lists$/);
});
