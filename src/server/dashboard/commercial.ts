import { prisma } from "@/lib/prisma";
import { compareValues, monthToDateRanges, periodLabel, type Comparison, type Period } from "@/lib/dashboard/periods";
import { QUOTE_AMOUNT_SELECT, openQuoteWhere, quoteExpiresAt, quoteNetUsd } from "./quotes";
import { quoteScope, type DashboardViewer } from "./viewer";

export type CommercialKpis = {
  created: Comparison;
  issued: Comparison;
  issuedAmount: Comparison;
  archived: Comparison;
};

export type OpenQuoteRow = {
  id: string;
  number: string;
  client: string;
  owner: string;
  status: string;
  amount: number;
  expiresAt: Date | null;
};

export type SellerRow = { ownerId: string; name: string; created: number; issued: number; issuedAmount: number; open: number; openAmount: number };

export type CommercialData = {
  kpis: CommercialKpis;
  previousLabel: string;
  openCount: number;
  openAmount: number;
  topOpen: OpenQuoteRow[];
  bySeller: SellerRow[] | null;
};

async function periodStats(scope: object, period: Period) {
  const range = { gte: period.from, lt: period.to };
  const [created, issuedRows, archived] = await Promise.all([
    prisma.quote.count({ where: { ...scope, createdAt: range } }),
    // Enviadas = se generó el PDF en el período (aunque después se haya reemplazado).
    prisma.quote.findMany({ where: { ...scope, issuedAt: range }, select: { ownerId: true, ...QUOTE_AMOUNT_SELECT } }),
    // Archivadas en el período: lo más cercano a «perdidas» que registra el sistema.
    prisma.quote.count({ where: { ...scope, status: "ARCHIVED", updatedAt: range } }),
  ]);
  return { created, issuedRows, archived };
}

/** Comercial del mes: lo creado, enviado y archivado, contra el mismo tramo del mes anterior. */
export async function loadCommercial(viewer: DashboardViewer, now: Date = new Date()): Promise<CommercialData> {
  const scope = quoteScope(viewer);
  const { current, previous } = monthToDateRanges(now);
  const [cur, prev, openRows, createdBySeller] = await Promise.all([
    periodStats(scope, current),
    periodStats(scope, previous),
    prisma.quote.findMany({
      where: { ...scope, ...openQuoteWhere(now) },
      select: {
        id: true,
        number: true,
        status: true,
        ownerId: true,
        issuedAt: true,
        clientName: true,
        client: { select: { companyName: true } },
        owner: { select: { name: true } },
        terms: { select: { validityDays: true } },
        ...QUOTE_AMOUNT_SELECT,
      },
    }),
    viewer.quotesAll
      ? prisma.quote.groupBy({ by: ["ownerId"], where: { createdAt: { gte: current.from, lt: current.to } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);

  const sum = (rows: Array<Parameters<typeof quoteNetUsd>[0]>) => rows.reduce((acc, row) => acc + quoteNetUsd(row), 0);
  const open = openRows
    .map((row) => ({ row, expiresAt: row.status === "ISSUED" ? quoteExpiresAt(row.issuedAt, row.terms?.validityDays) : null }))
    // Con PDF y vencida ya no está abierta.
    .filter(({ row, expiresAt }) => row.status !== "ISSUED" || (expiresAt && expiresAt >= now))
    .map(({ row, expiresAt }) => ({
      id: row.id,
      number: row.number,
      client: row.client?.companyName || row.clientName || "Sin cliente",
      owner: row.owner.name || "",
      ownerId: row.ownerId,
      status: row.status,
      amount: quoteNetUsd(row),
      expiresAt,
    }));

  let bySeller: SellerRow[] | null = null;
  if (viewer.quotesAll) {
    const map = new Map<string, SellerRow>();
    const get = (ownerId: string) => {
      const existing = map.get(ownerId);
      if (existing) return existing;
      const created: SellerRow = { ownerId, name: "", created: 0, issued: 0, issuedAmount: 0, open: 0, openAmount: 0 };
      map.set(ownerId, created);
      return created;
    };
    for (const row of createdBySeller) get(row.ownerId).created = row._count._all;
    for (const row of cur.issuedRows) {
      const s = get(row.ownerId);
      s.issued += 1;
      s.issuedAmount += quoteNetUsd(row);
    }
    for (const row of open) {
      const s = get(row.ownerId);
      s.open += 1;
      s.openAmount += row.amount;
    }
    const names = await prisma.user.findMany({ where: { id: { in: [...map.keys()] } }, select: { id: true, name: true } });
    for (const u of names) get(u.id).name = u.name || "Sin nombre";
    bySeller = [...map.values()].sort((a, b) => b.issuedAmount - a.issuedAmount || b.openAmount - a.openAmount || b.created - a.created);
  }

  return {
    kpis: {
      created: compareValues(cur.created, prev.created),
      issued: compareValues(cur.issuedRows.length, prev.issuedRows.length),
      issuedAmount: compareValues(sum(cur.issuedRows), sum(prev.issuedRows)),
      archived: compareValues(cur.archived, prev.archived),
    },
    previousLabel: periodLabel(previous),
    openCount: open.length,
    openAmount: open.reduce((acc, row) => acc + row.amount, 0),
    topOpen: [...open].sort((a, b) => b.amount - a.amount).slice(0, 5),
    bySeller,
  };
}
