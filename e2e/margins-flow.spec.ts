import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { SHIPPED_ADMIN_CHANGELOG } from "../src/data/admin-changelog";
import { CHANGELOG_SEEN_KEY } from "../src/lib/changelog-seen";

/**
 * Precios › Márgenes de punta a punta en la base PRUEBA, con la Revisión de cambios:
 *   1. alta por marca → «pendiente de revisión» en la tabla → aplicar → aparece la regla;
 *   2. editar el valor → chip en la fila; editar de nuevo → reemplaza a la anterior (no se duplica);
 *   3. cambiar solo el nombre → se guarda directo y se ve al toque;
 *   4. desactivar desde la tabla (dos clics = una sola revisión) y descartar;
 *   5. quitar → chip de borrado → aplicar → la regla desaparece;
 *   6. pestaña «Por producto»: carga recién al abrirla, pagina y deja la pestaña en la URL;
 * sin errores de hidratación («Creada …») en ningún momento.
 * Al final borra las reglas y revisiones que creó.
 */
const prisma = new PrismaClient();
const MARK = `E2E MARGENES ${Date.now().toString(36).toUpperCase()}`;

test.describe.configure({ mode: "serial" });
test.use({ storageState: AUTH_FILES.admin });

type Page = import("@playwright/test").Page;

const state: { startedAt: Date; brand?: { id: string; name: string }; ruleId?: string; consoleErrors: string[] } = {
  startedAt: new Date(),
  consoleErrors: [],
};

async function preparePage(page: Page) {
  // Novedades ya vistas: el aviso no tapa la pantalla.
  await page.addInitScript(
    ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
    [CHANGELOG_SEEN_KEY, SHIPPED_ADMIN_CHANGELOG.map((entry) => entry.id)] as const
  );
  page.on("console", (msg) => {
    if (msg.type() === "error" && /hydrat|did not match|Text content/i.test(msg.text())) state.consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => {
    if (/hydrat|did not match/i.test(err.message)) state.consoleErrors.push(err.message.slice(0, 300));
  });
  page.on("dialog", (dialog) => void dialog.accept());
}

const ruleForm = (page: Page) => page.locator("form").filter({ hasText: "¿Sobre qué?" }).first();
const ruleRow = (page: Page, id: string) => page.locator(`tr[data-rule-id="${id}"]`);

async function openMargins(page: Page) {
  await page.goto("/admin/margins", { waitUntil: "domcontentloaded" });
  await expect(ruleForm(page)).toBeVisible();
  // El aviso de cambios sin guardar toma la foto inicial después de hidratar.
  await page.waitForLoadState("networkidle");
}

async function setValue(page: Page, value: string) {
  const input = ruleForm(page).locator('input[type="number"]');
  await input.fill(value);
}

async function pendingReviewsFor(ruleId: string) {
  const rows = await prisma.priceReview.findMany({
    where: { status: "PENDING", area: "MARGIN", createdAt: { gte: state.startedAt } },
    select: { id: true, operation: true },
  });
  return rows.filter((r) => JSON.stringify(r.operation).includes(ruleId));
}

test.beforeAll(async () => {
  // Una marca chica (pocos productos activos) para que simular y aplicar sea rápido.
  const counts = await prisma.product.groupBy({
    by: ["brandId"],
    where: { isActive: true, brandId: { not: null }, baseCostUsd: { gt: 0 } },
    _count: { _all: true },
  });
  const small = counts.filter((c) => c._count._all >= 1 && c._count._all <= 15).sort((a, b) => a._count._all - b._count._all)[0];
  if (small?.brandId) state.brand = await prisma.brand.findUnique({ where: { id: small.brandId }, select: { id: true, name: true } }) ?? undefined;
});

test.afterAll(async () => {
  await prisma.marginRule.deleteMany({ where: { createdAt: { gte: state.startedAt }, OR: [{ name: { contains: MARK } }, { scopeId: state.brand?.id ?? "-" }] } });
  await prisma.priceReview.deleteMany({ where: { createdAt: { gte: state.startedAt }, area: "MARGIN" } });
  await prisma.$disconnect();
});

test("alta por marca: queda pendiente en la tabla y al aplicarla aparece la regla", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!state.brand, "No hay una marca chica con productos en esta base.");
  await preparePage(page);
  await openMargins(page);
  const form = ruleForm(page);

  await form.locator("select").first().selectOption("BRAND");
  await form.getByRole("combobox").last().fill(state.brand!.name);
  await page.getByRole("option", { name: state.brand!.name, exact: true }).getByRole("button").click();
  await setValue(page, "1.77");
  await form.getByRole("button", { name: "Personalización profunda (nombre interno)" }).click();
  await form.getByPlaceholder("Si lo dejás vacío, se arma solo.").fill(MARK);
  await form.getByRole("button", { name: /^Calcular impacto/ }).click();

  // Aviso arriba del formulario y la regla nueva listada como «espera revisión».
  await expect(page.getByRole("status").filter({ hasText: "Regla nueva" })).toBeVisible({ timeout: 120_000 });
  const strip = page.getByTestId("pending-new-rules");
  await expect(strip).toBeVisible();
  await expect(form.getByPlaceholder("Si lo dejás vacío, se arma solo.")).toHaveValue("");

  // Dos clics seguidos con lo mismo no duplican la revisión.
  await strip.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/price-reviews\//);
  await page.getByRole("button", { name: /^Aplicar/ }).click();
  await expect(page.getByText("Aplicada", { exact: true })).toBeVisible({ timeout: 120_000 });

  await page.goBack();
  await expect(ruleForm(page)).toBeVisible();
  const rule = await prisma.marginRule.findFirst({ where: { name: MARK }, select: { id: true } });
  expect(rule).not.toBeNull();
  state.ruleId = rule!.id;
  await expect(ruleRow(page, rule!.id)).toBeVisible({ timeout: 30_000 });
  await expect(ruleRow(page, rule!.id)).toContainText("× 1,77");
  await expect(page.getByTestId("pending-new-rules")).toHaveCount(0);
});

test("editar el valor: chip «pendiente de revisión»; otra edición reemplaza a la anterior", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!state.ruleId, "Falta la regla del paso anterior.");
  await preparePage(page);
  await openMargins(page);
  const row = ruleRow(page, state.ruleId!);

  await row.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: /Editar regla de precio/ })).toBeVisible();
  await setValue(page, "1.88");
  await ruleForm(page).getByRole("button", { name: "Calcular impacto del cambio" }).click();
  await expect(row.getByRole("link", { name: "Cambio pendiente de revisión" })).toBeVisible({ timeout: 120_000 });
  // El formulario vuelve a «Nueva regla» y el aviso queda a la vista.
  await expect(page.getByRole("heading", { name: "Nueva regla de precio" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Cambio de regla" })).toBeVisible();
  // La regla sigue con su valor: no se aplicó nada.
  await expect(row).toContainText("× 1,77");

  await row.getByRole("button", { name: "Editar" }).click();
  await expect(ruleForm(page).getByText(/ya tiene un cambio esperando revisión/)).toBeVisible();
  await setValue(page, "1.99");
  await ruleForm(page).getByRole("button", { name: "Calcular impacto del cambio" }).click();
  await expect(page.getByRole("heading", { name: "Nueva regla de precio" })).toBeVisible({ timeout: 120_000 });
  await expect.poll(async () => (await pendingReviewsFor(state.ruleId!)).length, { timeout: 30_000 }).toBe(1);
  const [latest] = await pendingReviewsFor(state.ruleId!);
  const chip = row.getByRole("link", { name: "Cambio pendiente de revisión" });
  // El chip apunta a la edición nueva (la anterior quedó descartada como reemplazada).
  await expect(chip).toHaveAttribute("href", `/admin/price-reviews/${latest.id}`, { timeout: 30_000 });
  await expect.poll(async () => (await prisma.priceReview.findMany({ where: { createdAt: { gte: state.startedAt }, status: "DISCARDED", area: "MARGIN" } })).length).toBeGreaterThan(0);

  // Descartar desde la revisión: la fila deja de figurar pendiente.
  await chip.click();
  await expect(page.getByRole("heading", { name: /^Editar regla de margen/ })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/price-reviews\//);
  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("Descartada", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.goBack();
  await expect(ruleRow(page, state.ruleId!)).toBeVisible();
  await expect(ruleRow(page, state.ruleId!).getByRole("link", { name: /pendiente de revisión/ })).toHaveCount(0, { timeout: 30_000 });
});

test("cambiar solo el nombre se guarda directo y se ve al toque", async ({ page }) => {
  test.setTimeout(240_000);
  test.skip(!state.ruleId, "Falta la regla del paso anterior.");
  await preparePage(page);
  await openMargins(page);
  const row = ruleRow(page, state.ruleId!);
  await row.getByRole("button", { name: "Editar" }).click();
  const name = ruleForm(page).getByPlaceholder("Si lo dejás vacío, se arma solo.");
  await expect(name).toHaveValue(MARK);
  await name.fill(`${MARK} RENOMBRADA`);
  await ruleForm(page).getByRole("button", { name: "Calcular impacto del cambio" }).click();
  await expect(row).toContainText(`${MARK} RENOMBRADA`, { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Nueva regla de precio" })).toBeVisible();
  // Guardar sin tocar nada no crea una revisión vacía.
  await row.getByRole("button", { name: "Editar" }).click();
  await ruleForm(page).getByRole("button", { name: "Calcular impacto del cambio" }).click();
  await expect(page.getByText("No había cambios para guardar.")).toBeVisible({ timeout: 120_000 });
  expect((await pendingReviewsFor(state.ruleId!)).length).toBe(0);
});

test("desactivar desde la tabla: una sola revisión aunque se pida dos veces", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!state.ruleId, "Falta la regla del paso anterior.");
  await preparePage(page);
  await openMargins(page);
  const row = ruleRow(page, state.ruleId!);
  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(row.getByRole("link", { name: "Desactivación pendiente de revisión" })).toBeVisible({ timeout: 120_000 });
  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "no se duplicó" })).toBeVisible({ timeout: 120_000 });
  expect((await pendingReviewsFor(state.ruleId!)).length).toBe(1);
  // Sigue activa hasta que alguien lo aplique.
  await expect(row.getByText("Activa", { exact: true })).toBeVisible();
});

test("quitar: queda pendiente de borrado y al aplicarlo la regla desaparece", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!state.ruleId, "Falta la regla del paso anterior.");
  await preparePage(page);
  await openMargins(page);
  const row = ruleRow(page, state.ruleId!);
  await row.getByRole("button", { name: "Quitar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Calcular borrado" }).click();
  const chip = row.getByRole("link", { name: "Borrado pendiente de revisión" });
  await expect(chip).toBeVisible({ timeout: 120_000 });
  // El borrado reemplaza en la fila al «desactivar» pendiente: es lo último que se pidió.
  await chip.click();
  await page.getByRole("button", { name: /^Aplicar/ }).click();
  await expect(page.getByText("Aplicada", { exact: true })).toBeVisible({ timeout: 120_000 });
  await page.goto("/admin/margins");
  await expect(ruleForm(page)).toBeVisible();
  await expect(ruleRow(page, state.ruleId!)).toHaveCount(0);
});

test("pestaña «Por producto»: carga al abrirla, pagina y queda en la URL", async ({ page }) => {
  test.setTimeout(300_000);
  await preparePage(page);
  let coverageCalls = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"] && /"coverage"/.test(req.postData() || "")) coverageCalls += 1;
  });
  await openMargins(page);
  // En «Reglas» no se calcula la cobertura de todo el catálogo.
  expect(coverageCalls).toBe(0);
  await expect(page).not.toHaveURL(/view=products/);

  await page.getByRole("tab", { name: "Por producto" }).click();
  await expect(page.getByText(/Página 1 de/)).toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/view=products/);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText(/Página 2 de/)).toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/page=2/);

  await page.reload();
  await expect(page.getByText(/Página 2 de/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("tab", { name: "Reglas" }).click();
  await expect(ruleForm(page)).toBeVisible();
  await expect(page).toHaveURL(/view=rules/);
});

test("sin errores de hidratación en todo el recorrido", async () => {
  expect(state.consoleErrors).toEqual([]);
});
