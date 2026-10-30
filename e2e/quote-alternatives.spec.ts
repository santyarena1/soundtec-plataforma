import { PrismaClient } from "@prisma/client";
import { extractText, getDocumentProxy } from "unpdf";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";
import { pickProduct } from "./picker";

/**
 * Alternativas: cada una con su propia planilla y su total; opcionales que suman
 * y dicen «Opcional»; nota del producto visible solo si se tilda; fotos en el PDF.
 */
const prisma = new PrismaClient();
const created: string[] = [];
test.describe.configure({ mode: "serial" });
test.use({ storageState: AUTH_FILES.admin });
test.afterAll(async () => {
  await prisma.quote.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

const NOTE_VISIBLE = "Se entrega configurado de fábrica";
const NOTE_INTERNAL = "Pedir precio especial al proveedor";

async function pdfText(page: import("@playwright/test").Page, quoteId: string): Promise<string> {
  const res = await page.request.get(`/api/admin/quotes/${quoteId}/preview-pdf`, { timeout: 180_000 });
  expect(res.ok()).toBeTruthy();
  const body = await res.body();
  if ((res.headers()["content-type"] || "").includes("text/html")) return body.toString("utf8").replace(/<[^>]+>/g, " ");
  const pdf = await getDocumentProxy(new Uint8Array(body));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

test("alternativas con planilla propia, opcional que suma, nota visible y fotos", async ({ page }) => {
  test.setTimeout(600_000);

  // Cotización rápida con un producto: al guardar ya queda con su foto para el PDF.
  await page.goto("/admin/quotes/quick", { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByPlaceholder("Ej. Hotel Alvear").fill("E2E Alternativas");
  await pickProduct(page, FIXTURES.withIncluded.sku);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.waitForURL(/editar=/, { timeout: 120_000 });
  const id = new URL(page.url()).searchParams.get("editar")!;
  created.push(id);
  const product = await prisma.quoteItem.findFirst({ where: { quoteId: id, productId: { not: null }, includedWithId: null } });
  const hasCatalogPhoto = (await prisma.productImage.count({ where: { productId: product!.productId! } })) > 0;
  if (hasCatalogPhoto) {
    expect(await prisma.quoteAsset.count({ where: { quoteId: id, kind: "PRODUCT", productId: product!.productId } })).toBe(1);
  }

  // Editor: con una sola alternativa se ofrece duplicarla.
  await page.goto(`/admin/quotes/${id}?paso=4`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "Duplicar como alternativa" }).click();
  await page.waitForURL(/alt=/, { timeout: 120_000 });
  await expect(page.getByRole("tab", { name: /Opción A/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("tab", { name: /Opción B/ })).toHaveAttribute("aria-selected", "true");
  const alts = await prisma.quoteAlternative.findMany({ where: { quoteId: id }, orderBy: { sortOrder: "asc" } });
  expect(alts.map((a) => a.name)).toEqual(["Opción A", "Opción B"]);
  const countIn = (altId: string) => prisma.quoteItem.count({ where: { quoteId: id, alternativeId: altId } });
  const before = await countIn(alts[0].id);
  expect(await countIn(alts[1].id)).toBe(before);

  // En la B: un servicio libre más, marcado opcional, y una nota visible + otra interna.
  await page.getByPlaceholder(/Ítem libre/).first().fill("Programación adicional");
  await page.getByLabel("Precio unitario USD").first().fill("100");
  await page.getByRole("button", { name: "Agregar ítem libre" }).first().click();
  await expect.poll(() => countIn(alts[1].id), { timeout: 60_000 }).toBe(before + 1);
  expect(await countIn(alts[0].id)).toBe(before);
  const extra = await prisma.quoteItem.findFirst({ where: { quoteId: id, alternativeId: alts[1].id, description: "Programación adicional" } });

  await page.reload({ waitUntil: "networkidle" });
  const extraRow = page.locator("tr").filter({ has: page.locator(`input[name="itemId"][value="${extra!.id}"]`) });
  await extraRow.getByText("Más…").click();
  await extraRow.getByRole("button", { name: "Marcar como opcional" }).click();
  await expect.poll(async () => (await prisma.quoteItem.findUnique({ where: { id: extra!.id } }))?.optional, { timeout: 60_000 }).toBe(true);

  const productB = await prisma.quoteItem.findFirst({ where: { quoteId: id, alternativeId: alts[1].id, productId: product!.productId, includedWithId: null } });
  await page.reload({ waitUntil: "networkidle" });
  const productRow = page.locator("tr").filter({ has: page.locator(`input[name="itemId"][value="${productB!.id}"]`) });
  await productRow.getByLabel("Nota del producto").fill(NOTE_VISIBLE);
  await productRow.getByLabel("Nota del producto").blur();
  await expect.poll(async () => (await prisma.quoteItem.findUnique({ where: { id: productB!.id } }))?.notes, { timeout: 60_000 }).toBe(NOTE_VISIBLE);
  await page.reload({ waitUntil: "networkidle" });
  await productRow.getByLabel("Mostrar en la cotización").check();
  await expect.poll(async () => (await prisma.quoteItem.findUnique({ where: { id: productB!.id } }))?.notesVisible, { timeout: 60_000 }).toBe(true);
  await prisma.quoteItem.update({ where: { id: extra!.id }, data: { notes: NOTE_INTERNAL } });

  // PDF: cada alternativa con su total; el opcional suma y dice «Opcional»; la nota interna no sale.
  const rows = await prisma.quoteItem.findMany({ where: { quoteId: id, excluded: false } });
  const sum = (altId: string) => rows.filter((r) => r.alternativeId === altId).reduce((s, r) => s + Number(r.lineTotalUsd), 0);
  expect(sum(alts[1].id)).toBeCloseTo(sum(alts[0].id) + 100, 2);
  const text = (await pdfText(page, id)).replace(/\s+/g, " ");
  expect(text).toContain("Total Opción A");
  expect(text).toContain("Total Opción B");
  expect(text).toMatch(/Opcional/i);
  expect(text).toContain(NOTE_VISIBLE);
  expect(text).not.toContain(NOTE_INTERNAL);

  // Borrar la B se lleva su planilla y deja la A intacta.
  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  await page.getByRole("button", { name: "Borrar alternativa" }).click();
  await expect.poll(() => prisma.quoteAlternative.count({ where: { quoteId: id } }), { timeout: 60_000 }).toBe(1);
  expect(await prisma.quoteItem.count({ where: { quoteId: id } })).toBe(before);
});
