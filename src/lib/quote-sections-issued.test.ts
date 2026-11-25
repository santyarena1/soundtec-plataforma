import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

test("abrir una cotización emitida no reescribe sus secciones", () => {
  const src = read("src/lib/quote-defaults.ts");
  const fn = src.slice(src.indexOf("export async function ensureQuoteSections"));
  const guard = fn.indexOf('quote.status === "ISSUED"');
  const firstWrite = fn.indexOf("prisma.quoteSection.");
  assert.ok(guard > 0 && guard < firstWrite, "el control de emitida va antes de cualquier escritura");
});

test("la escena 3D del enlace público no lleva precios de genéricos", () => {
  assert.match(read("src/app/p/[token]/escena/route.ts"), /priceUsd: null/);
});
