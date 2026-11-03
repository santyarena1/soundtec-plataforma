import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/**
 * Formularios: se crea en el panel, se abre, alguien sin sesión lo responde por
 * el enlace secreto y la respuesta llega ordenada al panel y al Excel.
 */
const prisma = new PrismaClient();
let formId: string | null = null;
test.afterAll(async () => {
  if (formId) await prisma.form.deleteMany({ where: { id: formId } });
  await prisma.$disconnect();
});

test("crear, compartir, responder y ver las respuestas", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const admin = await browser.newContext({ storageState: AUTH_FILES.admin, baseURL });
  const panel = await admin.newPage();
  panel.setDefaultTimeout(120_000);

  await panel.goto("/admin/forms", { waitUntil: "networkidle" });
  await panel.getByRole("button", { name: "Nuevo formulario" }).first().click();
  await panel.waitForURL(/\/admin\/forms\/[a-z0-9]+$/);
  formId = panel.url().split("/").pop()!;

  const title = panel.getByLabel("Título del formulario");
  await title.fill("Evento E2E");
  await title.blur();
  await expect.poll(async () => (await prisma.form.findUnique({ where: { id: formId! } }))?.title, { timeout: 60_000 }).toBe("Evento E2E");

  // Pregunta de opción única.
  await panel.getByRole("button", { name: "Agregar pregunta o contenido" }).click();
  await panel.getByRole("button", { name: /^Opción única/ }).click();
  await expect.poll(() => prisma.formBlock.count({ where: { formId: formId! } }), { timeout: 60_000 }).toBe(3);
  await panel.getByLabel("Pregunta").fill("¿Venís acompañado?");
  await expect
    .poll(async () => (await prisma.formBlock.findFirst({ where: { formId: formId!, type: "single_choice" } }))?.title, { timeout: 60_000 })
    .toBe("¿Venís acompañado?");

  // Mapa al final.
  await panel.getByRole("button", { name: "Agregar pregunta o contenido" }).click();
  await panel.getByRole("button", { name: /^Mapa/ }).click();
  await expect.poll(() => prisma.formBlock.count({ where: { formId: formId! } }), { timeout: 60_000 }).toBe(4);
  await panel.getByPlaceholder("Av. Alicia Moreau de Justo 1150, CABA").fill("Av. Alicia Moreau de Justo 1150, CABA");
  await expect
    .poll(async () => ((await prisma.formBlock.findFirst({ where: { formId: formId!, type: "map" } }))?.config as { mapQuery?: string } | null)?.mapQuery, { timeout: 60_000 })
    .toContain("Moreau");

  // En borrador el enlace no deja responder.
  const form = await prisma.form.findUniqueOrThrow({ where: { id: formId! } });
  const visitorContext = await browser.newContext({ baseURL });
  const visitor = await visitorContext.newPage();
  visitor.setDefaultTimeout(120_000);
  await visitor.goto(`/f/${form.token}`, { waitUntil: "networkidle" });
  await expect(visitor.getByText("todavía no está abierto")).toBeVisible();

  await panel.getByRole("group", { name: "Estado" }).getByRole("button", { name: "Abierto" }).click();
  await expect.poll(async () => (await prisma.form.findUnique({ where: { id: formId! } }))?.status, { timeout: 60_000 }).toBe("OPEN");

  // Alguien sin sesión responde por el enlace.
  await visitor.goto(`/f/${form.token}`, { waitUntil: "networkidle" });
  await visitor.getByRole("button", { name: /Comenzar/ }).click();
  // Orden: nombre, opción (se insertó después del nombre), mapa (después de la opción) y email al final.
  await visitor.getByPlaceholder("Escribí tu respuesta…").fill("Ana Pérez");
  await visitor.keyboard.press("Enter");
  await visitor.getByRole("button", { name: /Opción 2/ }).click();
  await expect(visitor.getByRole("link", { name: /Abrir en Google Maps/ })).toBeVisible();
  await visitor.getByRole("button", { name: "Continuar" }).click();
  const email = visitor.getByPlaceholder("nombre@empresa.com");
  await email.fill("ana@");
  await visitor.keyboard.press("Enter");
  await expect(visitor.getByText("Revisá el email")).toBeVisible();
  await email.fill("ana@empresa.com");
  await visitor.getByRole("button", { name: "Enviar" }).click();
  await expect(visitor.getByText("¡Gracias!")).toBeVisible();

  const response = await prisma.formResponse.findFirstOrThrow({ where: { formId: formId! } });
  const answers = Object.values(response.answers as Record<string, unknown>);
  expect(answers).toEqual(expect.arrayContaining(["Ana Pérez", "ana@empresa.com", "Opción 2"]));

  // En el panel: tabla y Excel.
  await panel.goto(`/admin/forms/${formId}/respuestas`, { waitUntil: "networkidle" });
  await expect(panel.getByText("Ana Pérez")).toBeVisible();
  await expect(panel.getByText("¿Venís acompañado?").first()).toBeVisible();
  const excel = await panel.request.get(`/api/admin/forms/${formId}/export`);
  expect(excel.ok()).toBeTruthy();
  expect(excel.headers()["content-type"]).toContain("spreadsheetml");

  await visitorContext.close();
  await admin.close();
});
