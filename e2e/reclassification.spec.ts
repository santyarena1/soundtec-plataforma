import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/** Reclasificación con el árbol de Tango: paso 1 (pasar los seguros) y paso 2 (revisar de a uno). */
const prisma = new PrismaClient();
const BATCH = "tango-2026-10";
const PAGE = "/admin/products/reclasificacion";

test.describe.configure({ mode: "serial" });
test.use({ storageState: AUTH_FILES.admin });
test.afterAll(async () => prisma.$disconnect());

const item = (page: import("@playwright/test").Page, model: string) =>
  page.locator("li").filter({ has: page.getByRole("link", { name: model, exact: true }) });

test("al entrar ya están las propuestas y los rubros nuevos, sin mover productos", async ({ page }) => {
  test.setTimeout(300_000);
  const before = await prisma.product.findMany({ select: { id: true, categoryId: true }, take: 200, orderBy: { id: "asc" } });
  await page.goto(PAGE, { waitUntil: "networkidle", timeout: 240_000 });
  await expect(page.getByText("Paso 1")).toBeVisible();
  expect(await prisma.categoryProposal.count({ where: { batch: BATCH } })).toBeGreaterThan(3000);
  expect(await prisma.tangoBranchSuggestion.count({ where: { batch: BATCH, status: "PENDING" } }), "los rubros nuevos se aplican solos").toBe(0);
  expect(await prisma.category.count({ where: { tangoPath: "VIDEO > SWITCHERS & MATRICES > DISTRIBUIDORES" } })).toBe(1);
  const after = await prisma.product.findMany({ where: { id: { in: before.map((p) => p.id) } }, select: { id: true, categoryId: true }, orderBy: { id: "asc" } });
  expect(after, "entrar no cambia el rubro de ningún producto").toEqual(before);
});

test("revisar de a uno: está bien, deshacer, dejarlo como está y va en otro rubro", async ({ page }) => {
  test.setTimeout(300_000);
  const sample = await prisma.categoryProposal.findMany({ where: { batch: BATCH, status: "PENDING", confidence: { not: "alta" } }, take: 3, include: { product: { select: { normalizedName: true } } } });
  expect(sample.length).toBe(3);
  const [a, b, c] = sample;

  await page.goto(`${PAGE}?q=${encodeURIComponent(a!.product.normalizedName)}`, { waitUntil: "networkidle", timeout: 120_000 });
  await item(page, a!.product.normalizedName).getByRole("button", { name: "Está bien" }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: a!.id } }))?.status, { timeout: 60_000 }).toBe("APPROVED");
  const node = await prisma.category.findUnique({ where: { tangoPath: a!.tangoPath } });
  expect((await prisma.product.findUnique({ where: { id: a!.productId } }))?.categoryId).toBe(node?.id);

  const previous = (await prisma.categoryProposal.findUnique({ where: { id: a!.id } }))?.previousCategoryId ?? null;
  await page.goto(`${PAGE}?ver=decididos&q=${encodeURIComponent(a!.product.normalizedName)}`, { waitUntil: "networkidle", timeout: 120_000 });
  await item(page, a!.product.normalizedName).getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: a!.id } }))?.status, { timeout: 60_000 }).toBe("PENDING");
  expect((await prisma.product.findUnique({ where: { id: a!.productId } }))?.categoryId ?? null).toBe(previous);

  const beforeB = (await prisma.product.findUnique({ where: { id: b!.productId } }))?.categoryId;
  await page.goto(`${PAGE}?q=${encodeURIComponent(b!.product.normalizedName)}`, { waitUntil: "networkidle", timeout: 120_000 });
  await item(page, b!.product.normalizedName).getByRole("button", { name: "Dejarlo como está" }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: b!.id } }))?.status, { timeout: 60_000 }).toBe("REJECTED");
  expect((await prisma.product.findUnique({ where: { id: b!.productId } }))?.categoryId).toBe(beforeB);

  await page.goto(`${PAGE}?q=${encodeURIComponent(c!.product.normalizedName)}`, { waitUntil: "networkidle", timeout: 120_000 });
  const row = item(page, c!.product.normalizedName);
  await row.getByRole("button", { name: "Va en otro rubro" }).click();
  await row.getByLabel("Buscar rubro").fill("bafles exterior");
  await row.getByRole("button", { name: /Bafles exterior/ }).first().click();
  await row.getByRole("button", { name: "Pasarlo a este rubro" }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: c!.id } }))?.appliedPath, { timeout: 60_000 }).toBe("SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR");

  // Dejar la base como estaba para la próxima corrida.
  for (const p of [b!, c!]) await prisma.categoryProposal.update({ where: { id: p.id }, data: { status: "PENDING", appliedPath: null, decidedAt: null, decidedById: null, tangoPath: p.tangoPath } });
  const restoreC = (await prisma.categoryProposal.findUnique({ where: { id: c!.id } }))?.previousCategoryId;
  await prisma.product.update({ where: { id: c!.productId }, data: { categoryId: restoreC ?? null } });
});

test("quitar un rubro nuevo devuelve sus productos al rubro original de Tango", async ({ page }) => {
  test.setTimeout(240_000);
  const branch = await prisma.tangoBranchSuggestion.findFirst({ where: { batch: BATCH, tangoPath: "CONTROL > CONTROL DE ACCESO > CERRADURAS", status: "APPROVED" } });
  test.skip(!branch, "Ese rubro ya se quitó en esta base.");
  const proposals = await prisma.categoryProposal.findMany({ where: { batch: BATCH, tangoPath: branch!.tangoPath } });
  expect(proposals.length).toBeGreaterThan(0);
  expect(proposals.every((p) => p.basePath)).toBe(true);
  await page.goto(PAGE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator("details summary").click();
  await page.locator("li").filter({ hasText: branch!.tangoPath }).getByRole("button", { name: "Quitar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click();
  await expect.poll(async () => (await prisma.tangoBranchSuggestion.findUnique({ where: { id: branch!.id } }))?.status, { timeout: 60_000 }).toBe("REJECTED");
  const back = await prisma.categoryProposal.findMany({ where: { id: { in: proposals.map((p) => p.id) } } });
  expect(back.every((p, i) => p.tangoPath === proposals.find((x) => x.id === p.id)!.basePath && i >= 0)).toBe(true);
});

test("paso 1: pasar los seguros mueve solo esos", async ({ page }) => {
  test.setTimeout(300_000);
  const safe = await prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: "alta" } });
  test.skip(safe === 0, "No quedan seguros pendientes en esta base.");
  const doubtful = await prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: { not: "alta" } } });
  await page.goto(PAGE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: /Pasar los .* seguros/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pasarlos" }).click();
  await expect.poll(async () => prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: "alta" } }), { timeout: 180_000 }).toBe(0);
  expect(await prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: { not: "alta" } } }), "los dudosos siguen para revisar").toBe(doubtful);
  await expect(page.getByText("Los seguros ya están pasados.")).toBeVisible({ timeout: 60_000 });
});
