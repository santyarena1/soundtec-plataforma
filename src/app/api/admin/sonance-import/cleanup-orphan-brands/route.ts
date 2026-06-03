import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isAuthorizedBySetupToken(req: NextRequest): boolean {
  const token = req.headers.get("x-setup-token");
  const expected = process.env.SETUP_TOKEN;
  return !!expected && token === expected;
}

/**
 * Elimina brands que matchean ciertos patrones de nombre Y tienen 0 productos.
 *
 * Pensado para limpiar brands generadas con nombres feos (pn_blaze, pn_apparel)
 * después de que se renombraron a sus versiones lindas (BLAZE BY SONANCE, etc).
 * Como ahora tienen 0 productos linkeados, son seguras de borrar.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedBySetupToken(req)) {
      await requireAdmin();
    }

    // Buscar todas las brands cuyo nombre empieza con "pn_" o "pn-" Y tienen 0 productos.
    const candidates = await prisma.brand.findMany({
      where: {
        OR: [
          { name: { startsWith: "pn_", mode: "insensitive" } },
          { name: { startsWith: "pn-", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        _count: { select: { products: true } },
      },
    });

    const toDelete = candidates.filter((b) => b._count.products === 0);
    const deletedNames: string[] = [];
    for (const b of toDelete) {
      await prisma.brand.delete({ where: { id: b.id } });
      deletedNames.push(b.name);
    }

    return NextResponse.json({
      ok: true,
      deleted: deletedNames.length,
      deletedNames,
      keptWithProducts: candidates.filter((b) => b._count.products > 0).map((b) => ({
        name: b.name,
        productCount: b._count.products,
      })),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
