import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

async function launchBrowser(): Promise<Browser> {
  const isServerless = Boolean(process.env.AWS_REGION || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1800, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ].filter(Boolean) as string[];

  let lastError: unknown;
  for (const executablePath of candidates) {
    try {
      return await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
      });
    } catch (error) {
      lastError = error;
    }
  }

  // Último recurso: binario empacado de @sparticuz/chromium también en local.
  try {
    return await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1800, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } catch (error) {
    throw lastError || error;
  }
}

/** Renderiza HTML tipográfico a PDF A4 (mismo motor visual que Vista / Word). */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ["load", "networkidle0"], timeout: 60_000 });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
    });
    return new Uint8Array(bytes);
  } finally {
    await browser.close();
  }
}
