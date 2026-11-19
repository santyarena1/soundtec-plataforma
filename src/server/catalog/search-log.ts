import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SEARCH_MAX_PER_HOUR, decideSearchLog, normalizeSearchQuery } from "@/lib/catalog-search-log";
import { VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { isCrawlerUserAgent } from "@/lib/expo/welcome-gate";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";

export type CatalogSearchSurface = "portal" | "catalogo";

/**
 * Registra una búsqueda del catálogo para «Lo más buscado» y «Búsquedas sin
 * resultados» del inicio del panel. No devuelve promesa a propósito: lee la
 * cookie y los headers en el momento y la escritura sigue sola, así la
 * búsqueda nunca espera a la base. Nunca tira error.
 */
export function logCatalogSearch(input: {
  query: string | null | undefined;
  results: number;
  surface: CatalogSearchSurface;
  page?: number;
  userId?: string | null;
  clientId?: string | null;
}): void {
  try {
    // Solo la primera página: paginar no es buscar otra vez.
    if (input.page && input.page > 1) return;
    const query = normalizeSearchQuery(input.query);
    if (!query) return;
    const hdrs = headers();
    if (isCrawlerUserAgent(hdrs.get("user-agent"))) return;
    const visitor = cookies().get(VISITOR_COOKIE)?.value;
    const visitorKey = input.userId ? `u:${input.userId}` : visitor ? `v:${visitor}` : `ip:${hashIp(clientIp(hdrs))}`;
    void persist({ query, results: Math.max(0, Math.round(input.results)), surface: input.surface, userId: input.userId ?? null, clientId: input.clientId ?? null, visitorKey });
  } catch (error) {
    console.error("[catalog] no se pudo registrar la búsqueda", error);
  }
}

async function persist(row: { query: string; results: number; surface: string; userId: string | null; clientId: string | null; visitorKey: string }) {
  try {
    const now = new Date();
    const [previous, lastHour] = await Promise.all([
      prisma.catalogSearch.findFirst({
        where: { visitorKey: row.visitorKey },
        orderBy: { createdAt: "desc" },
        select: { id: true, query: true, createdAt: true },
      }),
      prisma.catalogSearch.count({ where: { visitorKey: row.visitorKey, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } }),
    ]);
    const decision = decideSearchLog(previous ? { query: previous.query, at: previous.createdAt } : null, { query: row.query, at: now });
    if (decision === "skip") return;
    if (decision === "replace" && previous) {
      await prisma.catalogSearch.update({ where: { id: previous.id }, data: { query: row.query, results: row.results, createdAt: now } });
      return;
    }
    if (lastHour >= SEARCH_MAX_PER_HOUR) return;
    await prisma.catalogSearch.create({ data: row });
  } catch (error) {
    console.error("[catalog] no se pudo guardar la búsqueda", error);
  }
}
