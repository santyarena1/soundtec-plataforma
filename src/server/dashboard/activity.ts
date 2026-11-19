import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rankCallList, type CallCandidate, type ClientSignals } from "@/lib/dashboard/call-list";
import { DAY_MS, startOfDayArt } from "@/lib/dashboard/periods";
import { openQuoteWhere, quoteExpiresAt } from "./quotes";
import { clientScope, type DashboardViewer } from "./viewer";

/** Ventana de «actividad reciente» del inicio. */
export const ACTIVITY_DAYS = 7;
/** Sin entrar al portal hace más de esto = inactivo. */
export const INACTIVE_DAYS = 30;

type CountRow = { clientId: string; n: bigint | number };
const toMap = (rows: CountRow[]) => new Map(rows.map((r) => [r.clientId, Number(r.n)]));

/** Señales por empresa en la ventana. Cuentan solo los usuarios del portal identificados. */
async function clientSignalCounts(since: Date) {
  const [views, favorites, questions, searches, logins] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT u."clientId", COUNT(DISTINCT pv."productId") AS n
      FROM "ProductView" pv
      JOIN "User" u ON u.id = substring(pv."visitorKey" from 3)
      WHERE pv."createdAt" >= ${since} AND pv."visitorKey" LIKE 'u:%' AND u.role = 'CLIENT' AND u."clientId" IS NOT NULL
      GROUP BY u."clientId"
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT u."clientId", COUNT(*) AS n
      FROM "WishlistItem" wi
      JOIN "Wishlist" w ON w.id = wi."wishlistId"
      JOIN "User" u ON u.id = w."userId"
      WHERE wi."createdAt" >= ${since} AND u.role = 'CLIENT' AND u."clientId" IS NOT NULL
      GROUP BY u."clientId"
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT u."clientId", COUNT(*) AS n
      FROM "AiChatSession" s
      JOIN "AiChatMessage" m ON m."sessionId" = s.id
      JOIN "User" u ON u.id = s."userId"
      WHERE s."userId" IS NOT NULL AND s."lastActivityAt" >= ${since} AND m."createdAt" >= ${since} AND m.role = 'user' AND u."clientId" IS NOT NULL
      GROUP BY u."clientId"
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT "clientId", COUNT(*) AS n FROM "CatalogSearch"
      WHERE "createdAt" >= ${since} AND "clientId" IS NOT NULL
      GROUP BY "clientId"
    `,
    prisma.user.groupBy({
      by: ["clientId"],
      where: { role: "CLIENT", isActive: true, clientId: { not: null }, lastLoginAt: { gte: since } },
      _max: { lastLoginAt: true },
    }),
  ]);
  return {
    views: toMap(views),
    favorites: toMap(favorites),
    questions: toMap(questions),
    searches: toMap(searches),
    logins: new Map(logins.map((r) => [r.clientId as string, r._max.lastLoginAt])),
  };
}

/** «Para llamar»: empresas con movimiento en el portal y sin cotización abierta. */
export async function loadCallList(viewer: DashboardViewer, now: Date = new Date()): Promise<CallCandidate[]> {
  if (!viewer.seesClients) return [];
  const since = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);
  const s = await clientSignalCounts(since);
  const ids = [...new Set([...s.views.keys(), ...s.favorites.keys(), ...s.questions.keys(), ...s.searches.keys(), ...s.logins.keys()])];
  if (!ids.length) return [];
  const [clients, open] = await Promise.all([
    prisma.client.findMany({
      where: { id: { in: ids }, isActive: true, ...clientScope(viewer) },
      select: { id: true, companyName: true, owner: { select: { name: true } } },
    }),
    prisma.quote.findMany({
      where: { clientId: { in: ids }, ...openQuoteWhere(now) },
      select: { clientId: true, status: true, issuedAt: true, terms: { select: { validityDays: true } } },
    }),
  ]);
  const withOpen = new Set(
    open
      .filter((q) => q.status !== "ISSUED" || (quoteExpiresAt(q.issuedAt, q.terms?.validityDays)?.getTime() ?? 0) >= now.getTime())
      .map((q) => q.clientId)
  );
  const signals: ClientSignals[] = clients.map((c) => ({
    clientId: c.id,
    companyName: c.companyName,
    ownerName: c.owner?.name ?? null,
    productsViewed: s.views.get(c.id) ?? 0,
    favoritesAdded: s.favorites.get(c.id) ?? 0,
    aiQuestions: s.questions.get(c.id) ?? 0,
    searches: s.searches.get(c.id) ?? 0,
    lastLoginAt: s.logins.get(c.id) ?? null,
    hasOpenQuote: withOpen.has(c.id),
  }));
  return rankCallList(signals, now);
}

export type PortalPerson = { userId: string; name: string; company: string | null; clientId: string | null; at: Date };

export type PortalActivity = {
  loggedTodayCount: number;
  loggedWeekCount: number;
  loggedToday: PortalPerson[];
  inactiveCount: number;
  inactive: Array<{ clientId: string; company: string; lastLoginAt: Date }>;
  favorites: Array<{ id: string; productId: string; product: string; person: string; company: string | null; clientId: string | null; at: Date }>;
  questions: Array<{ id: string; text: string; person: string; company: string | null; clientId: string | null; at: Date }>;
};

/** Quién entró, quién dejó de entrar, qué guardaron y qué preguntaron (de los clientes que le tocan). */
export async function loadPortalActivity(viewer: DashboardViewer, now: Date = new Date()): Promise<PortalActivity | null> {
  if (!viewer.seesClients) return null;
  const today = startOfDayArt(now);
  const week = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);
  const cutoff = new Date(now.getTime() - INACTIVE_DAYS * DAY_MS);
  const userScope: Prisma.UserWhereInput = { role: "CLIENT", ...(viewer.clientsAll ? {} : { client: { is: { ownerId: viewer.userId } } }) };
  const ownerSql = viewer.clientsAll ? Prisma.empty : Prisma.sql`AND c."ownerId" = ${viewer.userId}`;
  const portalUserIds = viewer.clientsAll
    ? null
    : (await prisma.user.findMany({ where: userScope, select: { id: true } })).map((u) => u.id);

  const [todayRows, todayCount, weekCount, inactive, inactiveCount, favorites, sessions] = await Promise.all([
    prisma.user.findMany({
      where: { ...userScope, lastLoginAt: { gte: today } },
      orderBy: { lastLoginAt: "desc" },
      take: 8,
      select: { id: true, name: true, clientId: true, companyName: true, lastLoginAt: true, client: { select: { companyName: true } } },
    }),
    prisma.user.count({ where: { ...userScope, lastLoginAt: { gte: today } } }),
    prisma.user.count({ where: { ...userScope, lastLoginAt: { gte: week } } }),
    prisma.$queryRaw<Array<{ clientId: string; company: string; lastLoginAt: Date }>>`
      SELECT c.id AS "clientId", c."companyName" AS company, MAX(u."lastLoginAt") AS "lastLoginAt"
      FROM "Client" c JOIN "User" u ON u."clientId" = c.id AND u.role = 'CLIENT' AND u."isActive"
      WHERE c."isActive" ${ownerSql}
      GROUP BY c.id, c."companyName"
      HAVING MAX(u."lastLoginAt") < ${cutoff}
      ORDER BY MAX(u."lastLoginAt") DESC
      LIMIT 6
    `,
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM (
        SELECT c.id FROM "Client" c JOIN "User" u ON u."clientId" = c.id AND u.role = 'CLIENT' AND u."isActive"
        WHERE c."isActive" ${ownerSql}
        GROUP BY c.id HAVING MAX(u."lastLoginAt") < ${cutoff}
      ) x
    `,
    prisma.wishlistItem.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) }, wishlist: { user: userScope } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        createdAt: true,
        product: { select: { id: true, normalizedName: true } },
        wishlist: { select: { user: { select: { name: true, clientId: true, companyName: true, client: { select: { companyName: true } } } } } },
      },
    }),
    prisma.aiChatSession.findMany({
      where: {
        surface: { in: ["PUBLIC", "EXPO"] },
        lastActivityAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
        userId: portalUserIds ? { in: portalUserIds } : { not: null },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 10,
      select: { id: true, userId: true },
    }),
  ]);

  const sessionUser = new Map(sessions.map((s) => [s.id, s.userId as string]));
  const [messages, askers] = await Promise.all([
    sessions.length
      ? prisma.aiChatMessage.findMany({
          where: { sessionId: { in: sessions.map((s) => s.id) }, role: "user" },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, sessionId: true, content: true, createdAt: true },
        })
      : [],
    sessions.length
      ? prisma.user.findMany({
          where: { id: { in: [...new Set(sessions.map((s) => s.userId as string))] } },
          select: { id: true, name: true, clientId: true, companyName: true, client: { select: { companyName: true } } },
        })
      : [],
  ]);
  const askerById = new Map(askers.map((u) => [u.id, u]));

  return {
    loggedTodayCount: todayCount,
    loggedWeekCount: weekCount,
    loggedToday: todayRows.map((u) => ({ userId: u.id, name: u.name, company: u.client?.companyName ?? u.companyName, clientId: u.clientId, at: u.lastLoginAt as Date })),
    inactiveCount: Number(inactiveCount[0]?.n ?? 0),
    inactive,
    favorites: favorites.map((f) => ({
      id: f.id,
      productId: f.product.id,
      product: f.product.normalizedName,
      person: f.wishlist.user.name,
      company: f.wishlist.user.client?.companyName ?? f.wishlist.user.companyName,
      clientId: f.wishlist.user.clientId,
      at: f.createdAt,
    })),
    questions: messages.map((m) => {
      const u = askerById.get(sessionUser.get(m.sessionId) ?? "");
      return {
        id: m.id,
        text: m.content.length > 160 ? `${m.content.slice(0, 157)}…` : m.content,
        person: u?.name ?? "Cliente",
        company: u?.client?.companyName ?? u?.companyName ?? null,
        clientId: u?.clientId ?? null,
        at: m.createdAt,
      };
    }),
  };
}

export type ProductInterest = {
  topViewed: Array<{ productId: string; name: string; brand: string | null; visitors: number; clients: Array<{ id: string; company: string }> }>;
  topSearches: Array<{ query: string; times: number; people: number; results: number }>;
  zeroResults: Array<{ query: string; times: number; people: number }>;
  totalSearches: number;
};

/** Qué miran y qué buscan en el catálogo (portal y /catalogo), últimos 7 días. */
export async function loadProductInterest(viewer: DashboardViewer, now: Date = new Date()): Promise<ProductInterest> {
  const since = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);
  const [viewed, searches, zero, total] = await Promise.all([
    prisma.$queryRaw<Array<{ productId: string; visitors: bigint }>>`
      SELECT "productId", COUNT(DISTINCT "visitorKey") AS visitors
      FROM "ProductView" WHERE "createdAt" >= ${since}
      GROUP BY "productId" ORDER BY visitors DESC, MAX("createdAt") DESC LIMIT 8
    `,
    prisma.$queryRaw<Array<{ query: string; times: bigint; people: bigint; results: number }>>`
      SELECT query, COUNT(*) AS times, COUNT(DISTINCT "visitorKey") AS people, MAX(results) AS results
      FROM "CatalogSearch" WHERE "createdAt" >= ${since}
      GROUP BY query HAVING MAX(results) > 0 ORDER BY people DESC, times DESC LIMIT 8
    `,
    prisma.$queryRaw<Array<{ query: string; times: bigint; people: bigint }>>`
      SELECT query, COUNT(*) AS times, COUNT(DISTINCT "visitorKey") AS people
      FROM "CatalogSearch" WHERE "createdAt" >= ${since}
      GROUP BY query HAVING MAX(results) = 0 ORDER BY people DESC, times DESC LIMIT 8
    `,
    prisma.catalogSearch.count({ where: { createdAt: { gte: since } } }),
  ]);
  const ids = viewed.map((v) => v.productId);
  const [products, viewers] = await Promise.all([
    ids.length
      ? prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, normalizedName: true, brand: { select: { name: true } } } })
      : [],
    ids.length && viewer.seesClients
      ? prisma.$queryRaw<Array<{ productId: string; clientId: string; company: string; ownerId: string | null }>>`
          SELECT DISTINCT pv."productId", c.id AS "clientId", c."companyName" AS company, c."ownerId"
          FROM "ProductView" pv
          JOIN "User" u ON u.id = substring(pv."visitorKey" from 3)
          JOIN "Client" c ON c.id = u."clientId"
          WHERE pv."createdAt" >= ${since} AND pv."visitorKey" LIKE 'u:%' AND pv."productId" = ANY(${ids})
        `
      : [],
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const visible = viewers.filter((v) => viewer.clientsAll || v.ownerId === viewer.userId);
  return {
    topViewed: viewed
      .filter((v) => byId.has(v.productId))
      .map((v) => ({
        productId: v.productId,
        name: byId.get(v.productId)!.normalizedName,
        brand: byId.get(v.productId)!.brand?.name ?? null,
        visitors: Number(v.visitors),
        clients: visible.filter((x) => x.productId === v.productId).slice(0, 3).map((x) => ({ id: x.clientId, company: x.company })),
      })),
    topSearches: searches.map((s) => ({ query: s.query, times: Number(s.times), people: Number(s.people), results: Number(s.results) })),
    zeroResults: zero.map((s) => ({ query: s.query, times: Number(s.times), people: Number(s.people) })),
    totalSearches: total,
  };
}
