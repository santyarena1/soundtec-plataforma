/**
 * Cables del catálogo, clasificados por señal, tipo (armado / rollo) y largo,
 * para elegirlos en el cableado y sumarlos a la cotización.
 */

import { prisma } from "@/lib/prisma";
import { classifyCable, type CableProduct } from "./cable-picks";

const MAX_CABLES = 800;

export async function loadCableCatalog(): Promise<CableProduct[]> {
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      isDiscontinued: false,
      OR: [
        { aiProfile: { is: { productType: "cable" } } },
        { normalizedName: { contains: "cable", mode: "insensitive" } },
        { normalizedName: { contains: "CBL", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      normalizedName: true,
      shortDescription: true,
      specifications: true,
      baseCostUsd: true,
      brand: { select: { name: true } },
      aiProfile: { select: { summaryEs: true, searchTextEs: true } },
    },
    take: MAX_CABLES,
  });
  const out: CableProduct[] = [];
  for (const p of rows) {
    const specs = Array.isArray(p.specifications)
      ? (p.specifications as Array<Record<string, unknown>>).map((s) => `${String(s.label ?? "")} ${String(s.value ?? "")}`).join(" ")
      : "";
    const cable = classifyCable({
      id: p.id,
      name: p.normalizedName,
      brand: p.brand?.name ?? null,
      text: [p.shortDescription, p.aiProfile?.summaryEs, p.aiProfile?.searchTextEs, specs].filter(Boolean).join(" "),
      priceUsd: p.baseCostUsd != null ? Number(p.baseCostUsd) : null,
    });
    if (cable) out.push(cable);
  }
  return out;
}
