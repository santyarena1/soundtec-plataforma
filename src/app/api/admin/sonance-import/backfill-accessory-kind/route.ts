import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Auth alternativo: admite el setup token como header X-Setup-Token, además
 * del requireAdmin normal. Permite que un script externo (sin cookie) corra
 * el backfill una sola vez sin tener que login con NextAuth. */
function isAuthorizedBySetupToken(req: NextRequest): boolean {
  const token = req.headers.get("x-setup-token");
  const expected = process.env.SETUP_TOKEN;
  return !!expected && token === expected;
}

/**
 * Backfill de kind=ACCESORIO sobre productos ya linkeados.
 *
 * Busca todos los Product que son accessoryProductId en alguna AccessoryRelation
 * con kind=ACCESSORY y que aún tengan kind='PRINCIPAL'. Los actualiza a 'ACCESORIO'.
 *
 * Pensado para correr una sola vez después del cambio que automatizó esto en
 * el sync. Productos creados/linkeados después del cambio ya quedan con el kind
 * correcto en el momento del apply-mapping.
 *
 * NO toca el flag accessoryRequiredWithPrimary — ese sigue significando "obliga
 * a venderse con un principal compatible". El kind solo dice "es accesorio
 * por naturaleza, aunque podría venderse solo".
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedBySetupToken(req)) {
      await requireAdmin();
    }

    const relations = await prisma.accessoryRelation.findMany({
      where: { kind: "ACCESSORY" },
      select: { accessoryProductId: true },
    });
    const ids = Array.from(new Set(relations.map((r) => r.accessoryProductId)));

    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        scanned: 0,
        updated: 0,
        message: "No hay accesorios linkeados para backfillear.",
      });
    }

    // Solo actualizamos los que aún están como PRINCIPAL — evitamos updates
    // innecesarios y dejamos una métrica clara de qué cambió.
    const result = await prisma.product.updateMany({
      where: { id: { in: ids }, kind: "PRINCIPAL" },
      data: { kind: "ACCESORIO" },
    });

    return NextResponse.json({
      ok: true,
      scanned: ids.length,
      updated: result.count,
      message: `${result.count} producto(s) re-clasificado(s) como ACCESORIO de ${ids.length} accesorio(s) linkeado(s).`,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
