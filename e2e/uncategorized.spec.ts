import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/**
 * «Sin categorizar»: el equipo lo revisa uno a uno en Reclasificación; el
 * cliente no ve esa categoría (ni las viejas) en la columna de rubros, pero
 * sus productos siguen apareciendo en la búsqueda.
 */
const prisma = new PrismaClient();
const SLUG = "sin-categorizar";
const CLIENT = { email: "cliente.demo@soundtec.com.ar", password: process.env.QA_CLIENT_PASSWORD ?? "Cliente!2026" };

test.describe.configure({ mode: "serial" });
test.afterAll(async () => prisma.$disconnect());

async function uncategorizedSample() {
  const category = await prisma.category.findUnique({ where: { slug: SLUG } });
  test.skip(!category, "Esta base todavía no tiene «Sin categorizar» (correr scripts/categorias-solo-tango.ts).");
  const product = await prisma.product.findFirst({ where: { categoryId: category!.id, isActive: true }, orderBy: { normalizedName: "asc" }, select: { id: true, normalizedName: true } });
  test.skip(!product, "No hay productos en «Sin categorizar».");
  return { category: category!, product: product! };
}

test.describe("equipo", () => {
  test.use({ storageState: AUTH_FILES.admin });

  test("la bandeja «Para revisar uno a uno» asigna un rubro de Tango", async ({ page }) => {
    test.setTimeout(300_000);
    const { category, product } = await uncategorizedSample();
    const target = await prisma.category.findUniqueOrThrow({ where: { tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR" } });

    await page.goto("/admin/products?nocat=1", { waitUntil: "networkidle" });
    await expect(page.getByTestId("uncategorized-pill")).toContainText("Sin categorizar (");

    await page.goto(`/admin/products/reclasificacion?ver=uno-a-uno&q=${encodeURIComponent(product.normalizedName)}`, { waitUntil: "networkidle" });
    const row = page.getByTestId("uncategorized-item").filter({ has: page.getByRole("link", { name: product.normalizedName, exact: true }) });
    await expect(row.getByText("Categoría vieja")).toBeVisible();
    await row.getByLabel("Buscar rubro").fill("bafles exterior");
    await row.getByRole("button", { name: /Bafles exterior/ }).first().click();
    await row.getByRole("button", { name: "Guardar" }).click();
    await expect.poll(async () => (await prisma.product.findUnique({ where: { id: product.id } }))?.categoryId, { timeout: 60_000 }).toBe(target.id);

    // Dejar la base como estaba.
    await prisma.product.update({ where: { id: product.id }, data: { categoryId: category.id } });
    await prisma.categoryProposal.updateMany({
      where: { productId: product.id, batch: { in: ["sin-categorizar-2026-11", "tango-2026-10"] }, decidedAt: { gte: new Date(Date.now() - 10 * 60_000) } },
      data: { status: "PENDING", appliedPath: null, decidedAt: null, decidedById: null },
    });
  });
});

test.describe("cliente", () => {
  test("no ve «Sin categorizar» ni categorías viejas, pero encuentra el producto buscando", async ({ page }) => {
    test.setTimeout(300_000);
    const { product } = await uncategorizedSample();
    await page.goto("/login");
    await page.locator("#email").fill(CLIENT.email);
    await page.locator("#password").fill(CLIENT.password);
    await page.getByRole("button", { name: /iniciar sesi/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });

    await page.goto(`/portal/products?q=${encodeURIComponent(product.normalizedName)}`, { waitUntil: "networkidle" });
    await expect(page.getByText(product.normalizedName).first()).toBeVisible();
    await expect(page.getByText(/sin categorizar/i)).toHaveCount(0);

    await page.goto("/portal/products", { waitUntil: "networkidle" });
    await expect(page.getByText(/sin categorizar/i)).toHaveCount(0);
    for (const legacy of ["Pantallas táctiles y usuario", "Iluminación y entornos", "Soluciones de control"]) {
      await expect(page.getByText(legacy, { exact: true })).toHaveCount(0);
    }
  });
});
