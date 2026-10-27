import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/** Reclasificación con el árbol de Tango: cargar propuestas, aprobar, cambiar, rechazar, deshacer y aplicar las seguras. */
const prisma = new PrismaClient();
const BATCH = "tango-2026-10";
const PAGE = "/admin/products/reclasificacion";

test.describe.configure({ mode: "serial" });
test.use({ storageState: AUTH_FILES.admin });
test.afterAll(async () => prisma.$disconnect());

test("se cargan el árbol y las propuestas sin mover productos", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE, { waitUntil: "networkidle" });
  const load = page.getByRole("button", { name: "Cargar el árbol y las propuestas" });
  if (await load.isVisible()) {
    const before = await prisma.product.findMany({ select: { id: true, categoryId: true }, take: 200, orderBy: { id: "asc" } });
    await load.click();
    await expect(page.getByRole("button", { name: /Aplicar todas las de confianza alta/ })).toBeVisible({ timeout: 240_000 });
    const after = await prisma.product.findMany({ where: { id: { in: before.map((p) => p.id) } }, select: { id: true, categoryId: true }, orderBy: { id: "asc" } });
    expect(after, "cargar no cambia el rubro de ningún producto").toEqual(before);
  }
  expect(await prisma.categoryProposal.count({ where: { batch: BATCH } })).toBeGreaterThan(3000);
  expect(await prisma.category.count({ where: { tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR" } })).toBe(1);
});

test("aprobar, rechazar, deshacer y cambiar de a uno", async ({ page }) => {
  test.setTimeout(240_000);
  const sample = await prisma.categoryProposal.findMany({ where: { batch: BATCH, status: "PENDING", confidence: "media" }, take: 3, include: { product: { select: { normalizedName: true } } } });
  expect(sample.length).toBe(3);
  const [a, b, c] = sample;
  const item = (model: string) => page.locator("li").filter({ has: page.getByRole("link", { name: model, exact: true }) });

  // Aprobar: el producto pasa al rubro propuesto.
  await page.goto(`${PAGE}?conf=media&q=${encodeURIComponent(a!.product.normalizedName)}`, { waitUntil: "networkidle" });
  await item(a!.product.normalizedName).getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: a!.id } }))?.status, { timeout: 30_000 }).toBe("APPROVED");
  const node = await prisma.category.findUnique({ where: { tangoPath: a!.tangoPath } });
  expect((await prisma.product.findUnique({ where: { id: a!.productId } }))?.categoryId).toBe(node?.id);

  // Deshacer: vuelve a pendiente y el producto a su rubro anterior.
  const previous = (await prisma.categoryProposal.findUnique({ where: { id: a!.id } }))?.previousCategoryId ?? null;
  await page.goto(`${PAGE}?estado=aprobadas&q=${encodeURIComponent(a!.product.normalizedName)}`, { waitUntil: "networkidle" });
  await item(a!.product.normalizedName).getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: a!.id } }))?.status, { timeout: 30_000 }).toBe("PENDING");
  expect((await prisma.product.findUnique({ where: { id: a!.productId } }))?.categoryId ?? null).toBe(previous);

  // Rechazar: el producto queda como estaba.
  const beforeB = (await prisma.product.findUnique({ where: { id: b!.productId } }))?.categoryId;
  await page.goto(`${PAGE}?conf=media&q=${encodeURIComponent(b!.product.normalizedName)}`, { waitUntil: "networkidle" });
  await item(b!.product.normalizedName).getByRole("button", { name: "Rechazar" }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: b!.id } }))?.status, { timeout: 30_000 }).toBe("REJECTED");
  expect((await prisma.product.findUnique({ where: { id: b!.productId } }))?.categoryId).toBe(beforeB);

  // Cambiar: se elige otro rubro con el buscador y se aprueba con ese.
  await page.goto(`${PAGE}?conf=media&q=${encodeURIComponent(c!.product.normalizedName)}`, { waitUntil: "networkidle" });
  const row = item(c!.product.normalizedName);
  await row.getByRole("button", { name: "Cambiar" }).click();
  await row.getByLabel("Buscar rubro").fill("bafles exterior");
  await row.getByRole("button", { name: /Bafles exterior/ }).first().click();
  await row.getByRole("button", { name: "Aprobar con este rubro" }).click();
  await expect.poll(async () => (await prisma.categoryProposal.findUnique({ where: { id: c!.id } }))?.appliedPath, { timeout: 30_000 }).toBe("SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR");

  // Dejar la base como estaba para la próxima corrida.
  for (const p of [b!, c!]) {
    await prisma.categoryProposal.update({ where: { id: p.id }, data: { status: "PENDING", appliedPath: null, decidedAt: null, decidedById: null, tangoPath: p.tangoPath } });
  }
  const restoreC = (await prisma.categoryProposal.findUnique({ where: { id: c!.id } }))?.previousCategoryId;
  await prisma.product.update({ where: { id: c!.productId }, data: { categoryId: restoreC ?? null } });
});

test("rubro nuevo sugerido: crearlo pasa ahí a sus productos", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(PAGE, { waitUntil: "networkidle" });
  const loadBranches = page.getByRole("button", { name: "Cargar rubros sugeridos" });
  if (await loadBranches.isVisible()) {
    await loadBranches.click();
    await expect.poll(async () => prisma.tangoBranchSuggestion.count({ where: { batch: BATCH } }), { timeout: 120_000 }).toBeGreaterThan(10);
  }
  const branch = await prisma.tangoBranchSuggestion.findFirst({ where: { batch: BATCH, tangoPath: "CONTROL > CONTROL DE ACCESO > CERRADURAS" } });
  test.skip(!branch || branch.status !== "PENDING", "La rama de prueba ya se decidió en esta base.");
  await page.goto(PAGE, { waitUntil: "networkidle" });
  const item = page.locator("li").filter({ hasText: "CONTROL > CONTROL DE ACCESO > CERRADURAS" });
  await item.getByRole("button", { name: "Crear y mover sus productos" }).click();
  await expect.poll(async () => (await prisma.tangoBranchSuggestion.findUnique({ where: { id: branch!.id } }))?.status, { timeout: 60_000 }).toBe("APPROVED");
  const node = await prisma.category.findUnique({ where: { tangoPath: branch!.tangoPath } });
  expect(node?.level).toBe(3);
  const proposals = await prisma.categoryProposal.findMany({ where: { batch: BATCH, productId: { in: branch!.productIds } } });
  expect(proposals.every((p) => p.tangoPath === branch!.tangoPath || p.status === "REJECTED")).toBe(true);
});

test("aplicar todas las de confianza alta mueve solo esas", async ({ page }) => {
  test.setTimeout(300_000);
  const high = await prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: "alta" } });
  test.skip(high === 0, "No quedan seguras pendientes en esta base.");
  const mediumBefore = await prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: "media" } });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Aplicar todas las de confianza alta/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(async () => prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: "alta" } }), { timeout: 180_000 }).toBe(0);
  expect(await prisma.categoryProposal.count({ where: { batch: BATCH, status: "PENDING", confidence: "media" } }), "las dudosas siguen pendientes").toBe(mediumBefore);
  const sample = await prisma.categoryProposal.findFirst({ where: { batch: BATCH, status: "APPROVED", confidence: "alta" } });
  const node = await prisma.category.findUnique({ where: { tangoPath: sample!.appliedPath! } });
  expect((await prisma.product.findUnique({ where: { id: sample!.productId } }))?.categoryId).toBe(node?.id);
});
