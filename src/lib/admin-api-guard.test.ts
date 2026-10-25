import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Red de seguridad: el middleware NO cubre /api. Cada ruta de /api/admin tiene
 * que controlar la sesión ella misma (o llamar a una función que lo haga).
 * Si agregás una ruta y este test falla, sumale el control; si delega en una
 * función nueva que ya controla, agregá su nombre a GUARDS.
 */
const GUARDS = [
  "requireAdmin",
  "requireStaff",
  "requirePermission",
  "requireQuotePermission",
  "requireUser",
  "getCurrentPermissions",
  "getSessionUser",
  "loadQuoteForUser",
  "loadQuoteForEdit",
  "auth()",
  // Delegan el control (verificado):
  "buildQuoteWorkbook",
  "generateQuoteFromBrief",
  "ensureQuoteProductShortDescriptions",
  "authorizeHistoryIngest",
];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

test("toda ruta de /api/admin controla sesión o permiso", () => {
  const base = path.join(process.cwd(), "src", "app", "api", "admin");
  const missing = routes(base).filter((file) => {
    const source = readFileSync(file, "utf8");
    return !GUARDS.some((guard) => source.includes(guard));
  });
  assert.deepEqual(missing.map((f) => path.relative(process.cwd(), f)), []);
});
