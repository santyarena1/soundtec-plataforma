import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { pickProduct } from "./picker";

/** Servicios para cotizar: los administra un admin, el equipo los usa al cotizar, el cliente no los ve. */
const prisma = new PrismaClient();
const created: string[] = [];
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await prisma.quote.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

test.describe("admin", () => {
  test.use({ storageState: AUTH_FILES.admin });

  test("la lista trae los servicios del Excel y se edita el precio", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/admin/products/servicios", { waitUntil: "networkidle", timeout: 120_000 });
    expect(await prisma.quoteService.count()).toBeGreaterThanOrEqual(46);
    await expect(page.getByText("VTE CABA ING 1H - NORMAL", { exact: true })).toBeVisible();
    await expect(page.getByText("Sin precio").first()).toBeVisible();

    const svc = await prisma.quoteService.findFirst({ where: { name: "VTE CABA ING 1H - NORMAL" } });
    const original = Number(svc!.priceUsd);
    const row = page.locator("li").filter({ has: page.getByText("VTE CABA ING 1H - NORMAL", { exact: true }) });
    await row.getByRole("button", { name: "Editar" }).click();
    await page.locator("#svc-price").fill("123");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect.poll(async () => Number((await prisma.quoteService.findUnique({ where: { id: svc!.id } }))?.priceUsd), { timeout: 30_000 }).toBe(123);
    await prisma.quoteService.update({ where: { id: svc!.id }, data: { priceUsd: original } });
  });

  test("en la rápida: el servicio entra con su detalle y precio; el sin precio, en 0 con aviso", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/admin/quotes/quick", { waitUntil: "networkidle", timeout: 120_000 });
    await page.locator("#qq-client").fill("E2E Servicios");
    await pickProduct(page, "VTE CABA TECH 1H - NORMAL");
    await pickProduct(page, "INSTALACION MINIMA");
    await expect(page.getByText("Cargá el precio").or(page.locator('input[value="Cargá el precio"]')).first()).toBeVisible();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForURL(/editar=/, { timeout: 120_000 });
    const id = new URL(page.url()).searchParams.get("editar")!;
    created.push(id);
    const items = await prisma.quoteItem.findMany({ where: { quoteId: id }, orderBy: { sortOrder: "asc" } });
    const tech = items.find((i) => i.description.startsWith("VTE CABA TECH 1H - NORMAL"));
    expect(tech?.description).toContain("Asistencia técnica en sitio");
    expect(Number(tech?.unitPriceUsd)).toBe(70);
    expect(tech?.productId).toBeNull();
    expect(Number(items.find((i) => i.description.startsWith("INSTALACION MINIMA"))?.unitPriceUsd)).toBe(0);

    // En el editor completo el mismo buscador también agrega servicios.
    await page.goto(`/admin/quotes/${id}?paso=4`, { waitUntil: "networkidle", timeout: 120_000 });
    await pickProduct(page, "PROGRAMACION SISTEMA CRESTRON");
    await expect
      .poll(async () => prisma.quoteItem.findFirst({ where: { quoteId: id, description: { startsWith: "PROGRAMACION SISTEMA CRESTRON" } }, select: { unitPriceUsd: true, kind: true } }), { timeout: 60_000 })
      .toMatchObject({ kind: "SERVICE" });
    const prog = await prisma.quoteItem.findFirst({ where: { quoteId: id, description: { startsWith: "PROGRAMACION SISTEMA CRESTRON" } } });
    expect(Number(prog?.unitPriceUsd)).toBe(2500);
  });
});

test.describe("equipo y clientes", () => {
  test.use({ storageState: AUTH_FILES.seller });

  test("el vendedor no ve la lista de servicios pero los encuentra al cotizar", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/admin", { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByRole("link", { name: "Servicios", exact: true })).toHaveCount(0);
    const res = await page.goto("/admin/products/servicios", { waitUntil: "networkidle" });
    expect(page.url().includes("/admin/products/servicios") && res?.status() === 200 ? await page.getByText("VTE CABA ING 1H - NORMAL").count() : 0).toBe(0);
    await page.goto("/admin/quotes/quick", { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByPlaceholder("Buscá por modelo, marca o código").first().fill("VTE CABA");
    await expect(page.getByRole("option").filter({ hasText: "VTE CABA ING 1H - NORMAL" }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("el vendedor cambia el precio de un servicio solo en su cotización; el recupero negativo se guarda", async ({ page }) => {
    test.setTimeout(300_000);
    const svc = await prisma.quoteService.findFirst({ where: { name: "VTE CABA TECH SR 1H - NORMAL" } });
    const listPrice = Number(svc!.priceUsd);
    await page.goto("/admin/quotes/quick", { waitUntil: "networkidle", timeout: 120_000 });
    await page.locator("#qq-client").fill("E2E Precio de servicio");
    await pickProduct(page, "VTE CABA TECH SR 1H - NORMAL");
    await pickProduct(page, "RECUPERO DE ACTIVOS");
    const row = page.locator("table tbody tr").filter({ has: page.locator('input[value="VTE CABA TECH SR 1H - NORMAL"]') });
    await row.locator('input[type="number"]').nth(1).fill("99");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForURL(/editar=/, { timeout: 120_000 });
    const id = new URL(page.url()).searchParams.get("editar")!;
    created.push(id);
    const items = await prisma.quoteItem.findMany({ where: { quoteId: id } });
    expect(Number(items.find((i) => i.description.startsWith("VTE CABA TECH SR 1H - NORMAL"))?.unitPriceUsd)).toBe(99);
    expect(Number(items.find((i) => i.description.startsWith("RECUPERO DE ACTIVOS"))?.unitPriceUsd)).toBe(-2480);
    expect(Number((await prisma.quoteService.findUnique({ where: { id: svc!.id } }))?.priceUsd), "el servicio de la lista no cambia").toBe(listPrice);
  });

  test("el catálogo no muestra servicios", async ({ page }) => {
    await page.goto("/portal/products?q=VTE%20CABA", { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByText("VTE CABA ING 1H - NORMAL")).toHaveCount(0);
  });
});
