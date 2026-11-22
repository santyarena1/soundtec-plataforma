import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/**
 * Rubros + revisión de precios, de punta a punta en la base PRUEBA:
 *   1. crear un subrubro desde la ficha de producto («Crear subrubro acá») y asignarlo;
 *   2. asignarlo a otro producto desde la edición en lote;
 *   3. crear una regla de descuento por ese rubro → no se aplica: aparece la revisión
 *      con los 2 productos (precio actual → nuevo) → «Aplicar».
 * Al final deja la base como estaba (rubros, regla, subrubro y revisiones).
 */
const prisma = new PrismaClient();
const PARENT_PATH = "SONIDO > BAFLES PASIVOS";
const NAME = `E2E RUBROS ${Date.now().toString(36).toUpperCase()}`;
const SHOTS = process.env.E2E_SHOTS_DIR;

test.describe.configure({ mode: "serial" });
test.use({ storageState: AUTH_FILES.admin });

const state: { products: Array<{ id: string; sku: string; name: string; categoryId: string | null }>; nodeId?: string; startedAt: Date } = {
  products: [],
  startedAt: new Date(),
};

/**
 * Dos productos con costo y sin descuento propio: una regla de DESCUENTO por
 * rubro les cambia el precio (en esta base casi todas las marcas tienen regla
 * de margen, que va antes que la de rubro, así que se prueba con descuento).
 */
async function pickProducts() {
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      baseCostUsd: { gt: 0 },
      internalSku: { not: null },
      OR: [{ discountPercent: null }, { discountPercent: 0 }],
    },
    orderBy: { normalizedName: "asc" },
    take: 2,
    select: { id: true, internalSku: true, normalizedName: true, categoryId: true },
  });
  return rows.map((r) => ({ id: r.id, sku: r.internalSku!, name: r.normalizedName, categoryId: r.categoryId }));
}

test.beforeAll(async () => {
  state.products = await pickProducts();
});

test.afterAll(async () => {
  for (const p of state.products) await prisma.product.update({ where: { id: p.id }, data: { categoryId: p.categoryId } });
  if (state.nodeId) {
    await prisma.marginRule.deleteMany({ where: { scopeType: "CATEGORY", scopeId: state.nodeId } });
    await prisma.discountRule.deleteMany({ where: { scopeType: "CATEGORY", scopeId: state.nodeId } });
    await prisma.categoryEquivalence.deleteMany({ where: { categoryId: state.nodeId } });
    await prisma.category.deleteMany({ where: { id: state.nodeId } });
  }
  await prisma.priceReview.deleteMany({ where: { createdAt: { gte: state.startedAt }, title: { contains: "E2E RUBROS", mode: "insensitive" } } });
  await prisma.$disconnect();
});

test("crear un subrubro desde la ficha y asignárselo al producto", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(state.products.length < 2, "No hay 2 productos sin reglas de marca/producto en esta base.");
  const [first] = state.products;
  await page.goto(`/admin/products/${first.id}`, { waitUntil: "networkidle" });

  const form = page.locator("form#product-form, form").filter({ has: page.getByLabel("Buscar rubro") }).first();
  await form.getByRole("button", { name: /Ver árbol/ }).click();
  const dialog = form.getByRole("dialog", { name: "Elegir rubro" });
  // Volver a la raíz si abrió dentro del rubro actual.
  while (await dialog.getByRole("button", { name: "Subir un nivel" }).isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Subir un nivel" }).click();
  }
  await dialog.getByRole("button", { name: "Ver subrubros de Sonido" }).click();
  await dialog.getByRole("button", { name: "Ver subrubros de Bafles pasivos" }).click();
  await dialog.getByRole("button", { name: "Crear subrubro acá" }).click();
  await dialog.getByLabel("Nombre del subrubro nuevo").fill(NAME.toLowerCase());
  await dialog.getByRole("button", { name: "Crear", exact: true }).click();

  await expect.poll(async () => (await prisma.category.findUnique({ where: { tangoPath: `${PARENT_PATH} > ${NAME}` } }))?.id ?? null, { timeout: 60_000 }).not.toBeNull();
  const node = await prisma.category.findUniqueOrThrow({ where: { tangoPath: `${PARENT_PATH} > ${NAME}` } });
  state.nodeId = node.id;
  expect(node.pendingTango).toBe(true);
  expect(node.level).toBe(3);
  await expect(form.getByTestId("rubro-picker-value")).toContainText(/E2E rubros/i);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-ficha-subrubro-creado.png`, fullPage: false });

  await page.getByRole("button", { name: "Guardar cambios" }).first().click();
  await expect.poll(async () => (await prisma.product.findUnique({ where: { id: first.id } }))?.categoryId, { timeout: 60_000 }).toBe(node.id);
});

test("asignar el subrubro desde la edición en lote", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!state.nodeId, "Falta el subrubro del paso anterior.");
  const second = state.products[1];
  await page.goto(`/admin/products?q=${encodeURIComponent(second.sku)}`, { waitUntil: "networkidle" });
  const tableLink = page.getByRole("link", { name: "Tabla", exact: true });
  if (await tableLink.isVisible().catch(() => false)) await tableLink.click();
  await page.locator("thead input[type=checkbox]").first().check();
  await page.locator("select").filter({ has: page.locator('option[value="set_category"]') }).selectOption("set_category");
  await page.getByLabel("Buscar rubro").first().fill(NAME.slice(-6));
  await page.getByRole("button", { name: new RegExp(NAME.slice(-6), "i") }).first().click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-lote-asignar-rubro.png` });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Aplicar", exact: true }).last();
  await confirm.click();
  await expect.poll(async () => (await prisma.product.findUnique({ where: { id: second.id } }))?.categoryId, { timeout: 60_000 }).toBe(state.nodeId);
});

test("regla de descuento por rubro: pasa por la revisión con los productos afectados y se aplica", async ({ page }) => {
  test.setTimeout(400_000);
  test.skip(!state.nodeId, "Falta el subrubro del paso anterior.");
  await page.goto("/admin/discounts", { waitUntil: "networkidle" });
  await expect(page.getByText("Los cambios de esta pantalla no cambian precios al guardar.")).toBeVisible();

  await page.locator("select").filter({ has: page.locator('option[value="CATEGORY"]') }).first().selectOption("CATEGORY");
  await page.getByLabel("Buscar rubro").first().fill(NAME.slice(-6));
  await page.getByRole("button", { name: new RegExp(NAME.slice(-6), "i") }).first().click();
  await page.getByRole("heading", { name: "Descuentos" }).first().click();
  const value = page.locator('input[type="number"]').first();
  await value.fill("15");
  await page.getByRole("button", { name: /^Calcular impacto/ }).click();

  const notice = page.getByRole("status").filter({ hasText: "Mueve el precio de" });
  await expect(notice).toBeVisible({ timeout: 180_000 });
  await expect(notice).toContainText("2 productos");
  // Todavía no se aplicó: la regla no existe.
  expect(await prisma.discountRule.count({ where: { scopeType: "CATEGORY", scopeId: state.nodeId } })).toBe(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/03-descuentos-aviso-revision.png` });

  await notice.getByRole("link", { name: "Ver lista y aplicar" }).click();
  await page.waitForURL(/\/admin\/price-reviews\//);
  for (const p of state.products) await expect(page.getByRole("link", { name: p.name, exact: true })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/04-revision-pendiente.png`, fullPage: true });

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Aplicada", { exact: true })).toBeVisible({ timeout: 180_000 });
  expect(await prisma.discountRule.count({ where: { scopeType: "CATEGORY", scopeId: state.nodeId, isActive: true } })).toBe(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/05-revision-aplicada.png`, fullPage: true });
});
