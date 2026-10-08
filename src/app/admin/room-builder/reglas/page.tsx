import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AMPLIFIER_MATCH } from "@/services/room-builder/rank-from-db";
import { SPEC_PRODUCT_SELECT, effectiveSpec, loadIntegrationRules, type SpecProduct } from "@/services/room-builder/system-check-db";
import { RulesClient, type SpecRow } from "./rules-client";

export const dynamic = "force-dynamic";

const STREAMER_OR_SWITCH = ["NODE", "BluOS", "DM-NAX", "streamer", "switch"].map((t) => ({
  normalizedName: { contains: t, mode: "insensitive" as const },
}));

export default async function RoomBuilderRulesPage() {
  await requireAdmin();
  const [rules, brands, products] = await Promise.all([
    loadIntegrationRules(),
    prisma.brand.findMany({ where: { isActive: true }, select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { isActive: true, isDiscontinued: false, OR: [...AMPLIFIER_MATCH, ...STREAMER_OR_SWITCH, { systemSpec: { isNot: null } }] },
      select: SPEC_PRODUCT_SELECT,
      orderBy: [{ normalizedName: "asc" }],
      take: 600,
    }),
  ]);

  const specs: SpecRow[] = (products as unknown as SpecProduct[])
    .map((p) => ({
      productId: p.id,
      name: p.normalizedName,
      brand: p.brand?.name ?? "",
      imageUrl: p.images[0]?.url ?? null,
      spec: effectiveSpec(p),
    }))
    .filter((r) => r.spec.kind === "amplifier" || r.spec.kind === "streamer" || r.spec.kind === "switch" || r.spec.source === "manual")
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));

  return <RulesClient rules={rules} brands={brands} specs={specs} />;
}
