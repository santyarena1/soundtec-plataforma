/**
 * Medidor de velocidad del panel admin: recorre las pantallas con la sesión de
 * prueba y anota, por pantalla, TTFB, tiempo hasta contenido (LCP), fin del HTML
 * (el servidor terminó de transmitir), JS descargado, errores de consola y,
 * si el servidor corre con PERF_PRISMA_LOG, cantidad y duración de consultas.
 *
 * Nunca contra producción: usar un servidor local con la base PRUEBA.
 *
 *   # servidor (dev o `next start`) con el medidor de consultas:
 *   PERF_PRISMA_LOG=/ruta/queries.log npx next start -p 3240
 *   # recorrido (2 pasadas; se informa la última, la primera calienta):
 *   npx tsx scripts/perf-admin.ts --base http://localhost:3240 --log /ruta/queries.log --out perf.json
 *   # solo algunas: --only products,quotes   · otra sesión: --auth e2e/.auth/seller.json
 */
import { chromium, type Page } from "@playwright/test";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

type Route = { name: string; path: string; /** Para rutas con id: lista donde buscar el primer enlace. */ from?: string; match?: RegExp };

const ID = "[A-Za-z0-9_-]{8,}";
const ROUTES: Route[] = [
  { name: "inicio", path: "/admin" },
  { name: "solicitudes", path: "/admin/requests" },
  { name: "solicitud", path: "", from: "/admin/requests", match: new RegExp(`^/admin/requests/${ID}$`) },
  { name: "cotizaciones", path: "/admin/quotes" },
  { name: "cotizaciones-historial", path: "/admin/quotes/history" },
  { name: "cotizacion-editor", path: "", from: "/admin/quotes", match: new RegExp(`^/admin/quotes/(?!new|quick|history)${ID}$`) },
  { name: "cotizacion-rapida", path: "/admin/quotes/quick" },
  { name: "room-builder", path: "/admin/room-builder" },
  { name: "room-builder-editor", path: "", from: "/admin/room-builder", match: new RegExp(`^/admin/room-builder/(?!nuevo|plano|reglas)${ID}$`) },
  { name: "clientes", path: "/admin/clients" },
  { name: "cliente", path: "", from: "/admin/clients", match: new RegExp(`^/admin/clients/(?!nuevo)${ID}$`) },
  { name: "solicitudes-cuenta", path: "/admin/account-requests" },
  { name: "interesados", path: "/admin/leads" },
  { name: "formularios", path: "/admin/forms" },
  { name: "formulario", path: "", from: "/admin/forms", match: new RegExp(`^/admin/forms/${ID}$`) },
  { name: "campanas", path: "/admin/mailing" },
  { name: "productos", path: "/admin/products" },
  { name: "producto", path: "", from: "/admin/products", match: new RegExp(`^/admin/products/(?!new|servicios|reclasificacion)${ID}$`) },
  { name: "servicios", path: "/admin/products/servicios" },
  { name: "reclasificacion", path: "/admin/products/reclasificacion" },
  { name: "marcas", path: "/admin/brands" },
  { name: "rubros", path: "/admin/categories" },
  { name: "series", path: "/admin/categories/series" },
  { name: "etiquetas", path: "/admin/labels" },
  { name: "distribuidores", path: "/admin/distributors" },
  { name: "asistente", path: "/admin/assistant" },
  { name: "revision-precios", path: "/admin/price-reviews" },
  { name: "visibilidad", path: "/admin/visibility" },
  { name: "listas", path: "/admin/share-lists" },
  { name: "sincronizaciones", path: "/admin/sync" },
  { name: "importaciones", path: "/admin/imports" },
  { name: "soundtube", path: "/admin/soundtube-review" },
  { name: "ncm", path: "/admin/ncm" },
  { name: "usuarios", path: "/admin/users" },
  { name: "usuario", path: "", from: "/admin/users", match: new RegExp(`^/admin/users/${ID}$`) },
  { name: "configuracion", path: "/admin/settings" },
  { name: "config-general", path: "/admin/settings/general" },
  { name: "config-cotizaciones", path: "/admin/settings/quotes" },
  { name: "config-roles", path: "/admin/settings/roles" },
  { name: "config-integraciones", path: "/admin/settings/integrations" },
  { name: "landing", path: "/admin/landing" },
  { name: "sugerencias", path: "/admin/feedback" },
  { name: "ayuda", path: "/admin/ayuda" },
  { name: "changelog", path: "/admin/changelog" },
  { name: "tickets", path: "/admin/tickets" },
];

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "http://localhost:3218")!;
if (/soundtecportal\.com\.ar|vercel\.app/.test(BASE)) throw new Error("El medidor no corre contra producción.");
const LOG = arg("log");
const AUTH = arg("auth", "e2e/.auth/admin.json")!;
const RUNS = Number(arg("runs", "2"));
const ONLY = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const OUT = arg("out");
/** --detail: por pantalla, la consulta más lenta y las que más se repiten (para cazar N+1). */
const DETAIL = process.argv.includes("--detail");

type Result = {
  name: string;
  path: string;
  status: number | null;
  ttfb: number;
  content: number;
  htmlDone: number;
  load: number;
  jsKb: number;
  /** Documento HTML descomprimido (incluye el payload RSC en línea). */
  htmlKb: number;
  /** Pedidos en segundo plano: prefetch RSC y server actions. */
  background: { rsc: number; actions: number };
  queries: number | null;
  queryMs: number | null;
  slowest: string | null;
  repeated: string[];
  errors: string[];
};

function logSize(): number {
  return LOG && existsSync(LOG) ? statSync(LOG).size : 0;
}

function readQueries(from: number): { count: number; ms: number; slowest: string | null; repeated: string[] } | null {
  if (!LOG || !existsSync(LOG)) return null;
  const buf = readFileSync(LOG);
  const lines = buf.subarray(from).toString("utf8").split("\n").filter(Boolean);
  let ms = 0;
  let worst: [number, string] = [0, ""];
  const patterns = new Map<string, number>();
  for (const line of lines) {
    const [d, sql] = line.split("\t");
    const n = Number(d) || 0;
    ms += n;
    if (n > worst[0]) worst = [n, sql ?? ""];
    const key = (sql ?? "").replace(/\$\d+/g, "?").slice(0, 110);
    patterns.set(key, (patterns.get(key) ?? 0) + 1);
  }
  const repeated = [...patterns.entries()]
    .filter(([, c]) => c > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([q, c]) => `${c}x ${q}`);
  return { count: lines.length, ms, slowest: worst[1] ? `${worst[0]}ms ${worst[1].slice(0, 140)}` : null, repeated };
}

async function resolvePath(page: Page, route: Route): Promise<string | null> {
  if (route.path) return route.path;
  await page.goto(BASE + route.from!, { waitUntil: "domcontentloaded" });
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") || ""));
  return hrefs.find((h) => route.match!.test(h.split("?")[0]!)) ?? null;
}

async function measure(page: Page, route: Route, path: string): Promise<Result> {
  const errors: string[] = [];
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === "error") errors.push(msg.text().slice(0, 200));
  };
  const onPageError = (err: Error) => errors.push(`pageerror: ${err.message.slice(0, 200)}`);
  // Pedidos en segundo plano que dispara la pantalla: prefetch de enlaces (cada uno renderiza
  // el layout en el servidor) y server actions llamadas al montar.
  let rsc = 0;
  let actions = 0;
  const onRequest = (req: { url(): string; method(): string; headers(): Record<string, string> }) => {
    if (new URL(req.url()).searchParams.has("_rsc")) rsc += 1;
    else if (req.method() === "POST" && req.headers()["next-action"]) actions += 1;
  };
  page.on("request", onRequest);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  const before = logSize();
  const response = await page.goto(BASE + path, { waitUntil: "load", timeout: 180_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const timing = await page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const lcp = await new Promise<number>((resolve) => {
      let last = 0;
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) last = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        // sin LCP
      }
      setTimeout(() => resolve(last), 300);
    });
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const scripts = performance
      .getEntriesByType("resource")
      .filter((r) => (r as PerformanceResourceTiming).initiatorType === "script" || r.name.endsWith(".js"));
    const js = scripts.reduce((sum, r) => sum + ((r as PerformanceResourceTiming).encodedBodySize || 0), 0);
    return { ttfb: nav.responseStart, htmlDone: nav.responseEnd, load: nav.loadEventEnd, content: lcp || fcp, js, html: nav.decodedBodySize };
  });
  await page.waitForTimeout(400);
  page.off("request", onRequest);
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  const q = readQueries(before);
  return {
    name: route.name,
    path,
    status: response?.status() ?? null,
    ttfb: Math.round(timing.ttfb),
    content: Math.round(timing.content),
    htmlDone: Math.round(timing.htmlDone),
    load: Math.round(timing.load),
    jsKb: Math.round(timing.js / 1024),
    htmlKb: Math.round(timing.html / 1024),
    background: { rsc, actions },
    queries: q?.count ?? null,
    queryMs: q ? Math.round(q.ms) : null,
    slowest: q?.slowest ?? null,
    repeated: q?.repeated ?? [],
    errors: [...new Set(errors)],
  };
}

function table(results: Result[]): string {
  const rows = [...results].sort((a, b) => b.htmlDone - a.htmlDone);
  const head = "| pantalla | TTFB ms | contenido ms | HTML completo ms | HTML KB | JS KB | consultas | ms base | errores |\n|---|---:|---:|---:|---:|---:|---:|---:|---|";
  const body = rows
    .map((r) => `| ${r.name} | ${r.ttfb} | ${r.content} | ${r.htmlDone} | ${r.htmlKb} | ${r.jsKb} | ${r.queries ?? "-"} | ${r.queryMs ?? "-"} | ${r.errors.length ? r.errors.length : ""} |`)
    .join("\n");
  return `${head}\n${body}`;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 }, locale: "es-AR" });
  const page = await context.newPage();
  const routes = ROUTES.filter((r) => !ONLY || ONLY.includes(r.name));
  const results: Result[] = [];
  for (const route of routes) {
    const path = await resolvePath(page, route).catch(() => null);
    if (!path) {
      console.log(`- ${route.name}: sin ejemplo para medir`);
      continue;
    }
    let last: Result | null = null;
    for (let i = 0; i < RUNS; i++) {
      try {
        last = await measure(page, route, path);
      } catch (err) {
        console.log(`- ${route.name}: falló (${(err as Error).message.slice(0, 120)})`);
      }
    }
    if (!last) continue;
    results.push(last);
    const errs = last.errors.length ? `  ERRORES: ${last.errors.join(" | ")}` : "";
    if (DETAIL) {
      if (last.slowest) console.log(`    más lenta: ${last.slowest}`);
      for (const r of last.repeated) console.log(`    repetida: ${r}`);
    }
    console.log(
      `${route.name.padEnd(24)} ttfb ${String(last.ttfb).padStart(5)}  contenido ${String(last.content).padStart(5)}  html ${String(last.htmlDone).padStart(5)}  doc ${String(last.htmlKb).padStart(5)}KB  js ${String(last.jsKb).padStart(5)}KB  q ${last.queries ?? "-"} (${last.queryMs ?? "-"}ms)  bg ${last.background.rsc}rsc/${last.background.actions}act${errs}`
    );
  }
  await browser.close();
  console.log(`\n${table(results)}`);
  if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
