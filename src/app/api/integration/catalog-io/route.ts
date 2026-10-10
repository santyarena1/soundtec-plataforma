/**
 * Igual que /api/admin/room-builder/io-profiles/manual pero con token de
 * integración (Authorization: Bearer) en vez de sesión: para cargar fichas
 * desde scripts. Lee la cola de fichas y guarda lecturas validadas.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasIntegrationToken } from "@/lib/integration-token";
import { ioProfileStats } from "@/services/room-builder/io-profile/build";
import { manualQueue, saveManualReading } from "@/services/room-builder/io-profile/manual";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STATUSES = ["needs_review", "not_applicable", "auto", "approved"] as const;
const MAX_BATCH = 10;

/** Cola de fichas para leer afuera: producto + texto fuente armado por el sistema (specs, página y PDF). */
export async function GET(req: Request) {
  if (!(await hasIntegrationToken(req, "catalog-io"))) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const statuses = (q.get("status") ?? "needs_review").split(",").filter((s) => (STATUSES as readonly string[]).includes(s));
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(q.get("limit") ?? 5) || 5));
  const ids = q.get("ids")?.split(",").filter(Boolean).slice(0, MAX_BATCH);
  try {
    const out = await manualQueue({ statuses: statuses.length ? statuses : ["needs_review"], limit, afterId: q.get("after") ?? undefined, withNetwork: q.get("network") !== "0", productIds: ids });
    return NextResponse.json({ ok: true, ...out, stats: await ioProfileStats() });
  } catch (error) {
    console.error("[integration/catalog-io] queue", error);
    return NextResponse.json({ ok: false, error: "No se pudo armar la cola" }, { status: 500 });
  }
}

const reading = z.object({
  productId: z.string().min(1).max(64),
  sourceText: z.string().min(1).max(120_000),
  sourceUrls: z.array(z.string().url().max(1000)).max(8).default([]),
  source: z.enum(["datasheet", "specs", "page", "secondary"]),
  extraction: z.object({
    applies: z.boolean().optional(),
    ports: z.array(z.unknown()).max(80).optional(),
    capabilities: z.record(z.unknown()).optional(),
    notes: z.string().max(600).optional(),
  }),
  reader: z.string().min(1).max(40).default("claude"),
  fetchUrls: z.array(z.string().url().max(1000)).max(3).optional(),
});
const schema = z.object({ readings: z.array(reading).min(1).max(25) });

/** Guarda lecturas hechas afuera, con la misma validación de citas que la lectura automática. */
export async function POST(req: Request) {
  if (!(await hasIntegrationToken(req, "catalog-io"))) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Pedido inválido", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const results = [];
  for (const r of parsed.data.readings) {
    try {
      results.push(await saveManualReading(r));
    } catch (error) {
      console.error("[integration/catalog-io] save", r.productId, error);
      results.push({ productId: r.productId, error: "No se pudo guardar" });
    }
  }
  return NextResponse.json({ ok: true, results });
}
