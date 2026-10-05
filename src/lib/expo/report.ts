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

type CountedType = Exclude<VisitRow["type"], "BRAND_VIEW">;
const FIELD: Record<CountedType, keyof QrCounts> = { SCAN: "scans", LEAD: "leads", ACCOUNT_REQUEST: "accountRequests" };

function addTo<K>(map: Map<K, Set<string>>, key: K, visitorId: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(visitorId);
  map.set(key, set);
}

/**
 * Todo se cuenta por visitante único:
 * - byQr: visitantes únicos por QR y tipo;
 * - totals: visitantes únicos en todo el evento por tipo (alguien que escaneó
 *   dos QR cuenta una vez);
 * - topBrands: pares únicos (visitante, marca).
 */
export function buildExpoReport(visits: VisitRow[], brandNames: Record<string, string>): ExpoReport {
  const perQr = new Map<string, Set<string>>(); // `${qr}|${type}` → visitantes
  const perEvent = new Map<CountedType, Set<string>>();
  const brandViewers = new Map<string, Set<string>>();
  for (const visit of visits) {
    if (visit.type === "BRAND_VIEW") {
      if (visit.brandId) addTo(brandViewers, visit.brandId, visit.visitorId);
      continue;
    }
    addTo(perQr, `${visit.qrId ?? "-"}|${visit.type}`, visit.visitorId);
    addTo(perEvent, visit.type, visit.visitorId);
  }
  const byQr: Record<string, QrCounts> = {};
  for (const [key, visitors] of perQr) {
    const [qr, type] = key.split("|") as [string, CountedType];
    byQr[qr] = { ...(byQr[qr] ?? { scans: 0, leads: 0, accountRequests: 0 }), [FIELD[type]]: visitors.size };
  }
  const count = (type: CountedType) => perEvent.get(type)?.size ?? 0;
  const totals = { scans: count("SCAN"), leads: count("LEAD"), accountRequests: count("ACCOUNT_REQUEST") };
  const topBrands = [...brandViewers.entries()]
    .map(([brandId, viewers]) => ({ brandId, name: brandNames[brandId] ?? "—", views: viewers.size }))
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name));
  return { totals: { ...totals, leadRate: totals.scans ? totals.leads / totals.scans : 0 }, byQr, topBrands };
}
