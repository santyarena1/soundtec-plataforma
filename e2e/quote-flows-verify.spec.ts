import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";
import { pickProduct } from "./picker";

/**
 * Los tres caminos para crear una cotización, de punta a punta y generando el
 * PDF de verdad (en local hace falta PUPPETEER_EXECUTABLE_PATH apuntando a Chrome).
 * Se verifica en la base, no en textos de pantalla.
 */
const prisma = new PrismaClient();
const tag = `E2E-${Date.now().toString(36)}`;
const { sku } = FIXTURES.withIncluded;
const created: { quoteIds: string[]; requestId?: string; userEmail?: string; profileKeys: string[] } = { quoteIds: [], profileKeys: [] };

async function quoteFromUrl(url: string) {
  const id = new URL(url, "http://x").pathname.split("/").filter(Boolean).pop()!;
  created.quoteIds.push(id);
  return id;
}

async function waitForItems(quoteId: string, count: number) {
  await expect
    .poll(async () => prisma.quoteItem.count({ where: { quoteId, excluded: false } }), { timeout: 60_000, intervals: [1000, 2000, 4000] })
    .toBeGreaterThanOrEqual(count);
}

const quoteState = (quoteId: string) => prisma.quote.findUnique({ where: { id: quoteId }, select: { status: true, pdfOutdated: true, issuedAt: true } });

/** Genera el PDF desde el último paso, como lo haría el usuario (sin completar la entrega fila por fila). */
async function generatePdf(page: import("@playwright/test").Page, quoteUrl: string, quoteId: string) {
  await page.goto(`${quoteUrl}?paso=6`, { waitUntil: "networkidle" });
  const button = page.getByRole("button", { name: /Generar el PDF para el cliente|Volver a generar el PDF/ }).first();
  await expect(button, "sin faltantes el botón queda habilitado").toBeEnabled();
  // El estado pasa a «PDF generado» antes de armar el PDF; terminó recién cuando queda la revisión.
  const revisions = () => prisma.quoteRevision.count({ where: { quoteId, summary: { contains: "PDF regenerado" } } }).then(async (n) => n + (await prisma.quoteRevision.count({ where: { quoteId, summary: { startsWith: "Emisión" } } })));
  const before = await revisions();
  await button.click();
  await expect.poll(revisions, { timeout: 240_000, intervals: [2000, 4000] }).toBeGreaterThan(before);
  const q = await quoteState(quoteId);
  expect(q?.status).toBe("ISSUED");
  expect(q?.pdfOutdated).toBe(false);
}

test.afterAll(async () => {
  // Rama de prueba: se borra lo creado.
  await prisma.quote.deleteMany({ where: { id: { in: created.quoteIds } } }).catch(() => undefined);
  if (created.profileKeys.length) await prisma.quoteContentProfile.deleteMany({ where: { key: { in: created.profileKeys } } }).catch(() => undefined);
  if (created.requestId) await prisma.customerRequest.deleteMany({ where: { id: created.requestId } }).catch(() => undefined);
  if (created.userEmail) await prisma.user.deleteMany({ where: { email: created.userEmail } }).catch(() => undefined);
  await prisma.$disconnect();
});

test.describe.configure({ mode: "serial" });
test.use({ storageState: AUTH_FILES.admin });

test("RÁPIDA: producto + ítem libre, sin fotos, tipo Completo → PDF generado; «Editar» vuelve a la rápida", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/admin/quotes/quick", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Ej. Hotel Alvear").fill(`${tag} Rápida`);
  await pickProduct(page, sku);
  await page.getByRole("button", { name: /Agregar ítem libre/ }).click();
  await page.getByLabel("Descripción del ítem libre").fill(`${tag} Mano de obra`);
  const freeRow = page.locator("table tbody tr").filter({ hasText: "Ítem libre" });
  await freeRow.locator('input[type="number"]').nth(1).fill("150");
  await page.locator("#qq-type").selectOption("premium");
  await page.getByLabel("Mostrar las fotos de los productos en el PDF").uncheck();
  await page.getByRole("button", { name: "Guardar y generar el PDF" }).click();
  await expect(page.getByText("Ver el PDF").first()).toBeVisible({ timeout: 240_000 });

  const quote = await prisma.quote.findFirst({ where: { clientName: `${tag} Rápida` }, include: { items: true, contentProfile: true } });
  expect(quote, "la cotización rápida existe").toBeTruthy();
  created.quoteIds.push(quote!.id);
  expect(quote!.status).toBe("ISSUED");
  expect(quote!.pdfBlobUrl).toBeTruthy();
  expect(quote!.isQuick).toBe(true);
  expect(quote!.showProductPhotos).toBe(false);
  expect(quote!.contentProfile?.key).toBe("premium");
  // Producto + su incluido sin cargo (vinculado) + el ítem libre.
  const included = quote!.items.find((i) => i.includedWithId);
  expect(included && Number(included.unitPriceUsd)).toBe(0);
  const free = quote!.items.find((i) => !i.productId);
  expect(free?.description).toContain("Mano de obra");
  expect(Number(free?.unitPriceUsd)).toBe(150);

  // Desde la lista, «Editar» abre la rápida, no el editor completo.
  await page.goto(`/admin/quotes?q=${encodeURIComponent(quote!.number)}`, { waitUntil: "networkidle" });
  await page.locator("table tbody tr").filter({ hasText: quote!.number }).getByRole("link", { name: "Editar" }).click();
  await page.waitForURL(/\/admin\/quotes\/quick\?editar=/);
  await expect(page.getByLabel("Descripción del ítem libre")).toHaveValue(`${tag} Mano de obra`);
  await expect(page.getByRole("button", { name: "Guardar y volver a generar el PDF" })).toBeVisible();
});

test("TIPO PROPIO: se crea en Configuración y se elige al crear la cotización", async ({ page }) => {
  test.setTimeout(240_000);
  const name = `${tag} Compacto escolar`;
  await page.goto("/admin/settings/quotes", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nuevo tipo de documento" }).click();
  await page.locator("#dt-name").fill(name);
  await page.locator("#dt-base").selectOption("resumido");
  await page.locator("#dt-aud").selectOption("educacion_gobierno");
  await page.getByRole("button", { name: "Crear tipo" }).click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 60_000 });
  const profile = await prisma.quoteContentProfile.findFirst({ where: { name } });
  expect(profile?.isCustom).toBe(true);
  created.profileKeys.push(profile!.key);

  await page.goto("/admin/quotes/new", { waitUntil: "networkidle" });
  await page.locator("#clientName").fill(`${tag} Escuela`);
  await page.locator("#profileKey").selectOption(profile!.key);
  await page.getByRole("button", { name: "Crear cotización" }).click();
  await page.waitForURL(/\/admin\/quotes\/[^/?]+\?paso=/, { timeout: 180_000 });
  expect(page.url(), "la IA no arranca sola").not.toContain("autogen");
  const quoteId = await quoteFromUrl(page.url());
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { contentProfile: true } });
  expect(quote?.contentProfile?.key).toBe(profile!.key);
  expect(quote?.audience, "toma el rubro del tipo").toBe("educacion_gobierno");
});

test("COMÚN: nueva → producto → condiciones → PDF; después se edita igual y se vuelve a generar", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/admin/quotes/new", { waitUntil: "networkidle" });
  await page.locator("#clientName").fill(`${tag} Común`);
  await page.locator("#reference").fill(`${tag} proyecto`);
  await page.locator("#brief").fill("Salón de eventos con música funcional y micrófonos inalámbricos.");
  await page.locator("#validityDays").fill("9");
  await page.getByRole("button", { name: "Crear cotización" }).click();
  await page.waitForURL(/\/admin\/quotes\/[^/?]+\?paso=/, { timeout: 180_000 });
  expect(page.url(), "con brief la IA tampoco arranca sola").not.toContain("autogen");
  const quoteUrl = new URL(page.url()).pathname;
  const quoteId = await quoteFromUrl(page.url());
  expect((await prisma.quoteCommercialTerms.findUnique({ where: { quoteId } }))?.validityDays).toBe(9);

  await page.goto(`${quoteUrl}?paso=4`, { waitUntil: "networkidle" });
  await pickProduct(page, sku);
  await waitForItems(quoteId, 2); // el producto y lo que trae incluido
  expect(await prisma.quoteItem.count({ where: { quoteId, includedWithId: { not: null } } }), "el incluido también en el editor").toBeGreaterThan(0);

  await page.goto(`${quoteUrl}?paso=6`, { waitUntil: "networkidle" });
  await page.locator("#paymentTerms").fill("50% anticipo, saldo contra entrega");
  await page.locator("#deliveryText").fill("10 días hábiles");
  await page.getByRole("button", { name: "Guardar condiciones" }).click();
  await page.waitForLoadState("networkidle");
  await generatePdf(page, quoteUrl, quoteId);
  const pdf = await page.request.get(`/api/quotes/${quoteId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("pdf");

  // Con el PDF generado se sigue editando: el cambio se guarda y el PDF queda marcado desactualizado.
  await page.goto(`${quoteUrl}?paso=4`, { waitUntil: "networkidle" });
  await page.getByLabel("Descripción del ítem libre").first().fill(`${tag} Instalación`);
  await page.getByLabel("Precio unitario USD").first().fill("300");
  await page.getByRole("button", { name: "Agregar ítem libre" }).first().click();
  await expect.poll(async () => prisma.quoteItem.count({ where: { quoteId, description: { contains: "Instalación" } } }), { timeout: 60_000 }).toBe(1);
  await expect.poll(async () => (await quoteState(quoteId))?.pdfOutdated, { timeout: 30_000 }).toBe(true);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Volver a generar el PDF" }).first()).toBeVisible();
  await generatePdf(page, quoteUrl, quoteId);
});

test("DESDE PEDIDO: productos y cliente heredados, PDF, adjuntar y el cliente lo ve en el portal", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const product = await prisma.product.findFirst({ where: { internalSku: sku } });
  const email = `${tag.toLowerCase()}-portal@soundtec.test`;
  const password = `Clave-${randomUUID().slice(0, 8)}!`;
  const user = await prisma.user.create({
    data: { name: `${tag} Cliente`, email, passwordHash: await bcrypt.hash(password, 10), role: "CLIENT", companyName: `${tag} Empresa`, isActive: true },
  });
  created.userEmail = email;
  const request = await prisma.customerRequest.create({
    data: { userId: user.id, type: "ORDER", status: "SENT", projectDescription: `${tag} salón de eventos`, items: { create: [{ productId: product!.id, quantity: 3 }] } },
  });
  created.requestId = request.id;

  await page.goto(`/admin/requests/${request.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Generar cotización/ }).click();
  await expect(page.getByRole("checkbox", { name: /Completar textos con IA/ }), "la IA arranca destildada").not.toBeChecked();
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await page.waitForURL(/\/admin\/quotes\/[^/?]+\?paso=/, { timeout: 180_000 });
  const quoteUrl = new URL(page.url()).pathname;
  const quoteId = await quoteFromUrl(page.url());

  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { items: true } });
  expect(quote!.sourceRequestId, "vinculada al pedido").toBe(request.id);
  expect(quote!.clientId, "con cliente asignado").toBeTruthy();
  const main = quote!.items.find((i) => i.productId === product!.id && !i.includedWithId);
  expect(Number(main?.quantity), "misma cantidad que el pedido").toBe(3);
  const included = quote!.items.filter((i) => i.includedWithId === main?.id);
  expect(included.length, "lo incluido también desde el pedido").toBeGreaterThan(0);
  expect(Number(included[0]!.quantity)).toBe(3 * FIXTURES.withIncluded.perUnit);

  await page.goto(`${quoteUrl}?paso=6`, { waitUntil: "networkidle" });
  await page.locator("#deliveryText").fill("10 días hábiles");
  await page.getByRole("button", { name: "Guardar condiciones" }).click();
  await page.waitForLoadState("networkidle");
  await generatePdf(page, quoteUrl, quoteId);

  // Adjuntar al pedido como respuesta.
  await page.goto(`/admin/requests/${request.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Adjuntar PDF como respuesta/ }).first().click();
  await expect
    .poll(async () => prisma.requestMessage.count({ where: { requestId: request.id, message: { contains: quote!.number } } }), { timeout: 180_000 })
    .toBeGreaterThan(0);

  // El cliente entra al portal y descarga el PDF.
  const client = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const portal = await client.newPage();
  await portal.goto("/login", { waitUntil: "networkidle" });
  await portal.locator("#email").fill(email);
  await portal.locator("#password").fill(password);
  await portal.getByRole("button", { name: "Iniciar sesión" }).click();
  await portal.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  await portal.goto(`/portal/requests/${request.id}`, { waitUntil: "networkidle" });
  await expect(portal.getByText(quote!.number).first()).toBeVisible({ timeout: 60_000 });
  const pdf = await portal.request.get(`/api/portal/requests/${request.id}/quote-pdf/${quoteId}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("pdf");
  await client.close();
});
