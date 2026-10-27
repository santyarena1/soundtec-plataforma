import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/** Ficha: «Qué es este producto», línea y «Compatible con» por rubro + marca. */
const prisma = new PrismaClient();
test.use({ storageState: AUTH_FILES.admin });
test.afterAll(async () => prisma.$disconnect());

test("accesorio que no exige principal, línea y compatible con un rubro de una marca", async ({ page }) => {
  test.setTimeout(300_000);
  const amps = await prisma.category.findUnique({ where: { tangoPath: "SONIDO > AMPLIFICADORES" } });
  const sonance = await prisma.brand.findFirst({ where: { name: { equals: "SONANCE", mode: "insensitive" } } });
  const product = await prisma.product.findFirst({ where: { isActive: true, brand: { name: { equals: "SONANCE", mode: "insensitive" } }, category: { tangoPath: { startsWith: "SONIDO > BAFLES PASIVOS" } } } });
  test.skip(!amps || !sonance || !product, "Faltan datos de prueba (árbol de Tango o productos Sonance).");
  const original = await prisma.product.findUnique({ where: { id: product!.id }, select: { kind: true, accessoryRequiredWithPrimary: true, line: true } });

  try {
    await page.goto(`/admin/products/${product!.id}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.locator("#productRole").selectOption("ACC_LIBRE");
    await page.locator("#line").fill("E2E Línea");
    await page.getByRole("button", { name: "Guardar cambios" }).first().click();
    await expect
      .poll(async () => prisma.product.findUnique({ where: { id: product!.id }, select: { kind: true, accessoryRequiredWithPrimary: true, line: true } }), { timeout: 60_000 })
      .toEqual({ kind: "ACCESORIO", accessoryRequiredWithPrimary: false, line: "E2E Línea" });

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /Relaciones/ }).or(page.getByRole("button", { name: /^Relaciones/ })).first().click();
    await page.getByRole("button", { name: "Agregar un grupo compatible" }).click();
    await page.getByLabel("Buscar rubro").last().fill("amplificadores");
    await page.getByRole("button", { name: /^Sonido › Amplificadores$/ }).first().click();
    await page.locator("#compat-brand").selectOption(sonance!.id);
    await expect(page.getByText(/productos entran/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText(/Sonido › Amplificadores · SONANCE · \d+ productos/i)).toBeVisible({ timeout: 30_000 });
    expect(await prisma.compatibilityRule.count({ where: { productId: product!.id, categoryId: amps!.id, brandId: sonance!.id } })).toBe(1);

    await page.goto(`/portal/products/${product!.id}`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByRole("heading", { name: "Compatible con" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver productos" }).first()).toHaveAttribute("href", new RegExp(`category=${amps!.id}`));
  } finally {
    await prisma.compatibilityRule.deleteMany({ where: { productId: product!.id } });
    await prisma.product.update({ where: { id: product!.id }, data: original! });
  }
});
