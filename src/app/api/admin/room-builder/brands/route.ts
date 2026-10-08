import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { brandLogoSrc } from "@/lib/brand-logo";
import { BRAND_GROUPS, brandGroupForRole, ensureRoomBuilderSchema, type BrandGroup } from "@/services/room-builder";

export const dynamic = "force-dynamic";

const AMPLIFIER_NAME = /amplif|\bamp\b|amp-|powerzone|sonamp/i;
const MAX_PER_GROUP = 24;

type BrandOption = { slug: string; name: string; logo: string | null; products: number };

/**
 * Marcas con productos para cada tipo de equipo, para elegir preferencias en
 * el asistente. Ordenadas por cantidad de productos.
 */
export async function GET() {
  await requireAdmin();
  await ensureRoomBuilderSchema();
  const profiles = await prisma.productDesignProfile.findMany({
    where: { designRole: { not: null }, product: { isActive: true, isDiscontinued: false, brand: { isActive: true } } },
    select: {
      designRole: true,
      product: {
        select: {
          normalizedName: true,
          aiProfile: { select: { productType: true } },
          brand: { select: { id: true, slug: true, name: true, logoUrl: true } },
        },
      },
    },
  });

  const groups = new Map<BrandGroup, Map<string, BrandOption>>();
  for (const p of profiles) {
    const brand = p.product.brand;
    if (!brand || !p.designRole) continue;
    const isAmp = p.product.aiProfile?.productType === "amplifier" || AMPLIFIER_NAME.test(p.product.normalizedName);
    const group = brandGroupForRole(p.designRole, isAmp ? "amplifier" : "");
    if (!group) continue;
    const bucket = groups.get(group) ?? new Map<string, BrandOption>();
    const row = bucket.get(brand.slug) ?? { slug: brand.slug, name: brand.name, logo: brandLogoSrc(brand), products: 0 };
    row.products += 1;
    bucket.set(brand.slug, row);
    groups.set(group, bucket);
  }

  const result = Object.fromEntries(
    BRAND_GROUPS.map((g) => [
      g,
      [...(groups.get(g)?.values() ?? [])].sort((a, b) => b.products - a.products).slice(0, MAX_PER_GROUP),
    ]),
  );
  return NextResponse.json({ ok: true, brands: result });
}
