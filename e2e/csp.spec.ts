import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";
import { FIXTURES } from "./fixtures";

/**
 * La política de contenido (CSP de next.config) no puede bloquear nada de lo
 * que el sitio usa. Si este test falla, el mensaje dice qué recurso se bloqueó.
 */
const PAGES = [
  "/admin",
  "/admin/products",
  `/admin/products/${FIXTURES.editableProductId}`,
  "/admin/quotes",
  "/admin/quotes/quick",
  "/admin/settings/quotes",
  "/admin/settings/quotes/textos",
  "/portal/products",
  `/portal/products/${FIXTURES.editableProductId}`,
];

test.use({ storageState: AUTH_FILES.admin });

test("ninguna pantalla principal choca con la política de contenido", async ({ page }) => {
  test.setTimeout(600_000);
  const blocked: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to (load|execute|connect|frame|apply)/i.test(text)) blocked.push(`${page.url()} → ${text.slice(0, 200)}`);
  });
  for (const url of PAGES) {
    // Algunas pantallas ajustan su URL al cargar: si eso corta la navegación siguiente, se reintenta.
    const go = () => page.goto(url, { waitUntil: "load" });
    const response = await go().catch(go);
    await page.waitForLoadState("networkidle").catch(() => null);
    expect(response?.headers()["content-security-policy"], `sin CSP en ${url}`).toBeTruthy();
  }
  expect(blocked).toEqual([]);
});

test("encabezados de seguridad presentes y sin anunciar el framework", async ({ page }) => {
  const response = await page.goto("/login");
  const headers = response!.headers();
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});
