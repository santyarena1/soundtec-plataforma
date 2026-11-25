import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/**
 * «Ver como este usuario»: un admin entra como el cliente demo, ve su portal en
 * solo lectura, no puede guardar nada y vuelve a su ficha. El vendedor no ve el
 * ojo y un cliente no puede usar la vista de otro. Base de PRUEBA.
 */
const prisma = new PrismaClient();
const DEMO_EMAIL = "cliente.demo@soundtec.com.ar";
const clientEmail = `e2e-vercomo-${Date.now().toString(36)}@soundtec.test`;
const clientPassword = `Clave-e2e-${Date.now().toString(36)}!`;
let demo: { id: string; name: string; clientId: string | null };

test.beforeAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true, name: true, clientId: true } });
  if (!user) throw new Error(`Falta el cliente demo ${DEMO_EMAIL} en la base de prueba.`);
  demo = user;
  await prisma.user.create({
    data: { email: clientEmail, name: "E2E cliente ver-como", role: "CLIENT", clientId: user.clientId, passwordHash: await bcrypt.hash(clientPassword, 10), isActive: true },
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: clientEmail } });
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "login:" } } }).catch(() => null);
  await prisma.$disconnect();
});

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/ver-como/${name}.png`, fullPage: false });

test.describe("admin", () => {
  test.use({ storageState: AUTH_FILES.admin });

  test("entra como el cliente demo, ve su portal en solo lectura y vuelve", async ({ page }) => {
    const favoritesBefore = await prisma.wishlistItem.count({ where: { wishlist: { userId: demo.id } } });
    const startedAt = new Date();

    await page.goto(`/admin/users/${demo.id}`);
    await page.getByTestId("ver-como-boton").click();
    await page.waitForURL(/\/portal(\/|$|\?)/);
    const bar = page.getByTestId("ver-como-bar");
    await expect(bar).toContainText(demo.name);
    await expect(bar).toContainText("Integrador Demo S.A.");
    await expect(bar).toContainText("solo lectura");
    await shot(page, "01-portal-como-cliente");

    // Catálogo con los precios del cliente y una ficha (no registra la vista).
    await page.goto("/portal/products");
    await expect(bar).toBeVisible();
    await page.getByText("Ver todos los productos").click();
    await page.waitForURL((url) => url.pathname === "/portal/products" && url.search.length > 1);
    const fav = page.locator("[data-mutates]").first();
    await expect(fav).toHaveAttribute("aria-disabled", "true");
    await shot(page, "02-catalogo-como-cliente");
    await fav.click({ force: true });
    await expect(page.getByText(/solo lectura/i).last()).toBeVisible();
    await shot(page, "03-favorito-bloqueado");

    const firstProduct = page.locator('a[href^="/portal/products/"]').first();
    const href = await firstProduct.getAttribute("href");
    const productId = href?.split("?")[0]?.split("/portal/products/")[1] ?? null;
    if (href) {
      await page.goto(href);
      await expect(bar).toBeVisible();
      await shot(page, "03b-ficha-como-cliente");
    }

    // El servidor frena igual, sin pasar por la pantalla: Server Action y API.
    const action = await page.request.post("/portal/products", { headers: { "Next-Action": "0123456789abcdef", "Content-Type": "text/plain;charset=UTF-8" }, data: "[]" });
    expect(action.status()).toBe(403);
    expect((await action.json()).readOnlyView).toBe(true);
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const res = await page.request[method]("/api/admin/ai/conversations", { data: {} });
      expect(res.status(), method).toBe(403);
    }
    const chat = await page.request.post("/api/expo/chat", { data: { message: "hola" } });
    expect(chat.status()).toBe(403);

    expect(await prisma.wishlistItem.count({ where: { wishlist: { userId: demo.id } } })).toBe(favoritesBefore);
    // La ficha abierta en la vista no cuenta como visita del cliente (otros pueden estar usando al cliente demo: se mira solo esa ficha).
    if (productId) expect(await prisma.productView.count({ where: { productId, visitorKey: `u:${demo.id}`, createdAt: { gte: startedAt } } })).toBe(0);

    // Como cliente, el panel no se abre.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/portal/);

    // Salir vuelve a la ficha del usuario y queda registrado.
    // La ficha del admin tarda en compilar en dev: se espera la URL, no el clic.
    await Promise.all([
      page.waitForURL((url) => url.pathname === `/admin/users/${demo.id}`, { timeout: 180_000 }),
      page.getByTestId("ver-como-salir").click({ noWaitAfter: true }),
    ]);
    await expect(page.getByTestId("ver-como-bar")).toHaveCount(0);
    await expect(page.getByTestId("vistas-admin")).toContainText("qa-admin@soundtec.test");
    await shot(page, "04-de-vuelta-en-la-ficha");

    // Y ya se puede volver a guardar como admin: la vista no dejó nada colgado.
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "st_ver_como")).toBeUndefined();
  });

  test("buscar «amplificador» como el cliente demo da lo mismo que ve el cliente", async ({ page, browser, baseURL }) => {
    const SEARCH = "amplificador";
    const readCards = async (p: Page) => {
      await p.locator("main article").first().waitFor({ timeout: 120_000 });
      return p.locator("main article").evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
    };

    // Como el cliente de verdad: un acceso de la misma empresa, con «Activá tus descuentos» prendido
    // (en la vista se muestran los precios con las condiciones de la empresa).
    const temp = await prisma.user.findUniqueOrThrow({ where: { email: clientEmail }, select: { id: true } });
    const real = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const realPage = await real.newPage();
    await realPage.goto("/login");
    await realPage.locator("#email").fill(clientEmail);
    await realPage.locator("#password").fill(clientPassword);
    await realPage.getByRole("button", { name: /iniciar sesi/i }).click();
    await realPage.waitForURL((url) => !url.pathname.startsWith("/login"));
    await real.addCookies([{ name: "st_condiciones", value: temp.id, url: baseURL! }]);
    await realPage.goto(`/portal/products?q=${SEARCH}`);
    const expected = await readCards(realPage);
    await real.close();

    // En la vista: el catálogo público lleva al portal del cliente con la misma búsqueda.
    await page.goto(`/admin/users/${demo.id}`);
    await page.getByTestId("ver-como-boton").click();
    await page.waitForURL(/\/portal/);
    await page.goto(`/catalogo?q=${SEARCH}`);
    await page.waitForURL((url) => url.pathname === "/portal/products" && url.searchParams.get("q") === SEARCH);
    await expect(page.getByTestId("ver-como-bar")).toBeVisible();
    const seen = await readCards(page);
    await shot(page, "08-busqueda-amplificador-como-cliente");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toEqual(expected);
    expect(seen.join(" ")).toMatch(/US\$|USD|\$/);

    // Ninguna marca oculta para la empresa aparece en los resultados.
    if (demo.clientId) {
      const hidden = await prisma.visibilityRule.findMany({ where: { clientId: demo.clientId, canView: false, scopeType: "BRAND" }, select: { scopeId: true } });
      const ids = hidden.map((h) => h.scopeId).filter((id): id is string => Boolean(id));
      const names = ids.length ? (await prisma.brand.findMany({ where: { id: { in: ids } }, select: { name: true } })).map((b) => b.name.toUpperCase()) : [];
      for (const name of names) expect(seen.some((c) => c.toUpperCase().startsWith(name))).toBe(false);
    }

    // La ficha pública también pasa a la del portal.
    const firstHref = await page.locator('main article a[href^="/portal/products/"]').first().getAttribute("href");
    const productId = firstHref?.split("/portal/products/")[1]?.split("?")[0];
    if (productId) {
      await page.goto(`/catalogo/${productId}`);
      await page.waitForURL((url) => url.pathname === `/portal/products/${productId}`);
    }
    // Salir: la ficha del admin tarda en compilar en dev, así que se espera la URL y no la carga.
    await Promise.all([
      page.waitForURL(/\/admin\/users\//, { timeout: 180_000 }),
      page.getByTestId("ver-como-salir").click({ noWaitAfter: true }),
    ]);
  });

  test("no se puede ver como otro administrador", async ({ page }) => {
    const other = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, email: { not: "qa-admin@soundtec.test" } }, select: { id: true } });
    test.skip(!other, "no hay otro admin en la base de prueba");
    await page.goto(`/admin/users/${other!.id}`);
    await expect(page.getByTestId("ver-como-boton")).toHaveCount(0);
  });
});

test.describe("vendedor", () => {
  test.use({ storageState: AUTH_FILES.seller });

  test("no ve el ojo", async ({ page }) => {
    await page.goto(`/admin/users/${demo.id}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId("ver-como-boton")).toHaveCount(0);
    if (demo.clientId) {
      await page.goto(`/admin/clients/${demo.clientId}`);
      await expect(page.getByTestId("ver-como-boton")).toHaveCount(0);
    }
  });
});

test.describe("cliente", () => {
  test("no puede usar la vista ni con una cookie ajena", async ({ browser, baseURL }) => {
    // Una vista válida de un admin…
    const admin = await browser.newContext({ storageState: AUTH_FILES.admin, baseURL });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/admin/users/${demo.id}`);
    await adminPage.getByTestId("ver-como-boton").click();
    await adminPage.waitForURL(/\/portal/);
    const token = (await admin.cookies()).find((c) => c.name === "st_ver_como");
    expect(token).toBeTruthy();
    await adminPage.goto("/ver-como/salir");
    await admin.close();

    // …pegada en el navegador de un cliente no sirve: la vista es del admin que la abrió.
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.locator("#email").fill(clientEmail);
    await page.locator("#password").fill(clientPassword);
    await page.getByRole("button", { name: /iniciar sesi/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await ctx.addCookies([{ ...token!, expires: -1 }]);
    await page.goto("/portal");
    await expect(page.getByTestId("ver-como-bar")).toHaveCount(0);
    expect((await ctx.cookies()).find((c) => c.name === "st_ver_como")).toBeUndefined();
    // Las rutas de la vista no le hacen nada.
    await page.goto("/ver-como/renovar?volver=/portal");
    await expect(page.getByTestId("ver-como-bar")).toHaveCount(0);
    await ctx.close();
  });
});
