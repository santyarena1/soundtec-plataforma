import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { RELEVANCE_WINDOW_DAYS } from "@/lib/catalog-relevance";
import { VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { isCrawlerUserAgent } from "@/lib/expo/welcome-gate";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";

/** Misma persona abriendo la misma ficha dentro de esta ventana cuenta una sola vez. */
const DEDUPE_MS = 30 * 60 * 1000;

/**
 * Registra la vista de una ficha. Best-effort: nunca rompe la página.
 * Los bots no cuentan.
 */
export async function recordProductView(productId: string, userId?: string | null): Promise<void> {
  try {
    const hdrs = await headers();
    if (isCrawlerUserAgent(hdrs.get("user-agent"))) return;
    const store = await cookies();
    const visitorKey = userId
      ? `u:${userId}`
      : store.get(VISITOR_COOKIE)?.value
        ? `v:${store.get(VISITOR_COOKIE)!.value}`
        : `ip:${hashIp(clientIp(hdrs))}`;
    const recent = await prisma.productView.findFirst({
      where: { productId, visitorKey, createdAt: { gt: new Date(Date.now() - DEDUPE_MS) } },
      select: { id: true },
    });
    if (!recent) await prisma.productView.create({ data: { productId, visitorKey } });
  } catch (error) {
    console.error("[catalog] no se pudo registrar la vista de ficha", error);
  }
}

/**
 * Visitantes únicos por producto en la ventana de relevancia, y el total
 * (suma de esos únicos) para decidir si ya hay datos suficientes.
 */
const VIEW_CACHE_MS = 60_000;
let viewCache: { at: number; data: { views: Map<string, number>; total: number } } | null = null;

export async function loadProductViewCounts(): Promise<{ views: Map<string, number>; total: number }> {
  if (viewCache && Date.now() - viewCache.at < VIEW_CACHE_MS) return viewCache.data;
  try {
    const since = new Date(Date.now() - RELEVANCE_WINDOW_DAYS * 86400000);
    const rows = await prisma.$queryRaw<Array<{ productId: string; visitors: bigint }>>`
      SELECT "productId", COUNT(DISTINCT "visitorKey") AS visitors
      FROM "ProductView"
      WHERE "createdAt" > ${since}
      GROUP BY "productId"
    `;
    const views = new Map(rows.map((r) => [r.productId, Number(r.visitors)]));
    let total = 0;
    for (const count of views.values()) total += count;
    const data = { views, total };
    viewCache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.error("[catalog] no se pudieron leer las vistas de ficha", error);
    return { views: new Map(), total: 0 };
  }
}
