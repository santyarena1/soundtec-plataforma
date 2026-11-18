import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { AUTH_FILES } from "./global-setup";

/**
 * Celular a 390 px: ninguna página puede tener scroll horizontal ni piezas que se salgan de
 * la pantalla. html y body tienen overflow-x: clip, así que lo que se sale no da scroll: queda
 * cortado (así se veían las tarjetas de la búsqueda). Por eso, además del scrollWidth, se buscan
 * elementos que pasen el borde sin estar dentro de un contenedor con su propio scroll o recorte.
 */
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "es-AR" };

const PUBLIC_PAGES = ["/", "/catalogo", "/catalogo?q=amplificador", "/catalogo?q=amplificador&view=table", "/login", "/solicitar-cuenta"];
const PORTAL_PAGES = [
  "/portal",
  "/portal/products",
  "/portal/products?q=amplificador",
  "/portal/products?q=amplificador&view=table",
  "/portal/wishlist",
  "/portal/tutoriales",
  "/expo?from=portal",
];

async function overflowReport(page: Page): Promise<{ scrollWidth: number; width: number; outside: string[] }> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const clippedByAncestor = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== "visible") return true;
      }
      return false;
    };
    const outside: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if ((rect.right > width + 1 || rect.left < -1) && !clippedByAncestor(el)) {
        const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        outside.push(`${el.tagName.toLowerCase()} ${Math.round(rect.left)}..${Math.round(rect.right)} «${text}»`);
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, width, outside: outside.slice(0, 10) };
  });
}

async function checkPages(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const report = await overflowReport(page);
    expect.soft(report.scrollWidth, `${path}: scroll horizontal`).toBeLessThanOrEqual(report.width);
    expect.soft(report.outside, `${path}: elementos fuera de la pantalla`).toEqual([]);
  }
}

test("público a 390 px sin scroll horizontal", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const context = await browser.newContext({ ...MOBILE, baseURL });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await checkPages(page, PUBLIC_PAGES);
  // Ficha de producto: la primera de la búsqueda.
  await page.goto("/catalogo?q=amplificador", { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/catalogo/c"]').first().getAttribute("href");
  if (href) await checkPages(page, [href]);
  await context.close();
});

test("portal a 390 px sin scroll horizontal", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const context = await browser.newContext({ ...MOBILE, baseURL, storageState: AUTH_FILES.admin });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await page.addLocatorHandler(page.getByRole("button", { name: "Ahora no" }), (button) => button.click());
  await checkPages(page, PORTAL_PAGES);
  await page.goto("/portal/products?q=amplificador", { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/portal/products/c"]').first().getAttribute("href");
  if (href) await checkPages(page, [href]);
  await context.close();
});
