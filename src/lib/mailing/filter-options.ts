import { prisma } from "@/lib/prisma";
import { CLIENT_SEGMENTS, PROVINCES, TAX_CONDITIONS } from "@/lib/clients/fields";

export type FilterOptions = {
  owners: Array<{ id: string; name: string }>;
  segments: string[];
  taxConditions: string[];
  provinces: string[];
  events: Array<{ id: string; name: string }>;
};

/** Opciones para los filtros de listas desde la base (rubros, responsables, provincias, eventos). */
export async function loadFilterOptions(): Promise<FilterOptions> {
  const [owners, segments, provinces, events] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN", "STAFF"] }, ownedClients: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { segment: { not: null } }, distinct: ["segment"], select: { segment: true } }),
    prisma.client.findMany({ where: { province: { not: null } }, distinct: ["province"], select: { province: true } }),
    prisma.expoEvent.findMany({ orderBy: { startsAt: "desc" }, select: { id: true, name: true } }),
  ]);
  const merge = (base: readonly string[], extra: Array<string | null>) => [...new Set([...base, ...extra.filter((v): v is string => Boolean(v?.trim()))])];
  return {
    owners,
    segments: merge(CLIENT_SEGMENTS, segments.map((s) => s.segment)),
    taxConditions: [...TAX_CONDITIONS],
    provinces: merge(PROVINCES, provinces.map((p) => p.province)),
    events,
  };
}
