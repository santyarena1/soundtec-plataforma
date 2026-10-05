export type VisitRow = {
  qrId: string | null;
  visitorId: string;
  type: "SCAN" | "BRAND_VIEW" | "LEAD" | "ACCOUNT_REQUEST";
  brandId: string | null;
};

export type QrCounts = { scans: number; leads: number; accountRequests: number };

export type ExpoReport = {
  totals: QrCounts & { leadRate: number };
  byQr: Record<string, QrCounts>;
  topBrands: Array<{ brandId: string; name: string; views: number }>;
};

/** Escaneos = visitantes únicos por QR; leads y cuentas = eventos únicos por visitante. */
export function buildExpoReport(visits: VisitRow[], brandNames: Record<string, string>): ExpoReport {
  const uniq = new Map<string, Set<string>>(); // `${qr}|${type}` → visitantes
  const brandViews = new Map<string, number>();
  for (const visit of visits) {
    if (visit.type === "BRAND_VIEW") {
      if (visit.brandId) brandViews.set(visit.brandId, (brandViews.get(visit.brandId) ?? 0) + 1);
      continue;
    }
    const key = `${visit.qrId ?? "-"}|${visit.type}`;
    if (!uniq.has(key)) uniq.set(key, new Set());
    uniq.get(key)!.add(visit.visitorId);
  }
  const byQr: Record<string, QrCounts> = {};
  for (const [key, visitors] of uniq) {
    const [qr, type] = key.split("|");
    byQr[qr] ??= { scans: 0, leads: 0, accountRequests: 0 };
    if (type === "SCAN") byQr[qr].scans = visitors.size;
    if (type === "LEAD") byQr[qr].leads = visitors.size;
    if (type === "ACCOUNT_REQUEST") byQr[qr].accountRequests = visitors.size;
  }
  const totals = Object.values(byQr).reduce(
    (acc, c) => ({ scans: acc.scans + c.scans, leads: acc.leads + c.leads, accountRequests: acc.accountRequests + c.accountRequests }),
    { scans: 0, leads: 0, accountRequests: 0 }
  );
  const topBrands = [...brandViews.entries()]
    .map(([brandId, views]) => ({ brandId, name: brandNames[brandId] ?? "—", views }))
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name));
  return { totals: { ...totals, leadRate: totals.scans ? totals.leads / totals.scans : 0 }, byQr, topBrands };
}
