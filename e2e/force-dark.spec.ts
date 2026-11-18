import { chromium, type Browser, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { expect, test } from "./test";

/**
 * Modo oscuro del teléfono: Chrome en Android con «Oscurecer sitios web» (Auto Dark Theme)
 * pinta oscuras las páginas que no lo impiden. Acá se lanza Chromium con ese oscurecido
 * forzado y se compara cada página contra la misma página sin forzar: tiene que verse igual
 * de clara (layout.tsx declara «light dark» en la raíz y globals.css deja el body en «only light»).
 */
const FORCE_DARK_ARGS = ["--blink-settings=forceDarkModeEnabled=true"];
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "es-AR" };
const PAGES = ["/login", "/solicitar-cuenta", "/catalogo", "/catalogo?q=amplificador"];

/** Luminancia media (0-255) de una franja de la captura. */
function luminance(png: Buffer): number {
  const image = PNG.sync.read(png);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < image.data.length; i += 4 * 31) {
    sum += 0.2126 * image.data[i]! + 0.7152 * image.data[i + 1]! + 0.0722 * image.data[i + 2]!;
    count += 1;
  }
  return sum / count;
}

async function shot(browser: Browser, baseURL: string, path: string, colorScheme: "light" | "dark"): Promise<{ lum: number; bodyBg: string }> {
  const context = await browser.newContext({ ...MOBILE, baseURL, colorScheme });
  const page: Page = await context.newPage();
  await page.goto(path, { waitUntil: "networkidle" });
  // Sin animaciones ni cursor: las dos capturas tienen que ser comparables.
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  await page.waitForTimeout(500);
  const lum = luminance(await page.screenshot());
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await context.close();
  return { lum, bodyBg };
}

test.describe("modo oscuro forzado del teléfono", () => {
  let dark: Browser;
  let light: Browser;
  test.beforeAll(async () => {
    dark = await chromium.launch({ args: FORCE_DARK_ARGS });
    light = await chromium.launch();
  });
  test.afterAll(async () => {
    await dark?.close();
    await light?.close();
  });

  test("el oscurecido forzado está activo (control)", async () => {
    // Una página sin declaración de color: con el flag tiene que salir oscura; si no, la prueba no prueba nada.
    const context = await dark.newContext({ ...MOBILE, colorScheme: "dark" });
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;height:100vh;background:#fcfcfd"></body></html>');
    expect(luminance(await page.screenshot())).toBeLessThan(80);
    await context.close();
  });

  for (const path of PAGES) {
    test(`${path} sigue clara`, async ({ baseURL }) => {
      test.setTimeout(240_000);
      const normal = await shot(light, baseURL!, path, "light");
      const forced = await shot(dark, baseURL!, path, "dark");
      // El color calculado del body no cambia con el oscurecido (se aplica al pintar): lo que
      // se compara es la captura, que tiene que salir igual de luminosa que la normal.
      expect(forced.bodyBg).toBe("rgb(252, 252, 253)");
      expect(Math.abs(forced.lum - normal.lum)).toBeLessThan(6);
    });
  }
});
