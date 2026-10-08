import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { draftDesignProfileFromProduct } from "./from-product";
import { ensureRoomBuilderSchema } from "./ensure-schema";

export type EnrichBatchResult = {
  scanned: number;
  upserted: number;
  skipped: number;
  nextCursor: string | null;
};

/**
 * Genera/actualiza ProductDesignProfile desde datos ya en plataforma
 * (specs, dims, AI profile, URL oficial). Sin red externa.
 */
export async function enrichDesignProfilesBatch(options?: {
  take?: number;
  cursor?: string | null;
  onlyMissing?: boolean;
}): Promise<EnrichBatchResult> {
  await ensureRoomBuilderSchema();
  const take = Math.min(Math.max(options?.take ?? 80, 1), 200);
  const onlyMissing = options?.onlyMissing !== false;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(onlyMissing ? { designProfile: null } : {}),
      ...(options?.cursor ? { id: { gt: options.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take,
    select: {
      id: true,
      normalizedName: true,
      modelNumber: true,
      manufacturerItem: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      weight: true,
      isDiscontinued: true,
      isCrestronHomeCompatible: true,
      vendorProductUrl: true,
      specifications: true,
      keyFeatures: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      family: { select: { name: true } },
      aiProfile: {
        select: {
          productType: true,
          mountTypes: true,
          applications: true,
        },
      },
    },
  });

  let upserted = 0;
  let skipped = 0;

  for (const product of products) {
    const draft = draftDesignProfileFromProduct({
      id: product.id,
      normalizedName: product.normalizedName,
      modelNumber: product.modelNumber,
      manufacturerItem: product.manufacturerItem,
      widthCm: product.widthCm == null ? null : Number(product.widthCm),
      heightCm: product.heightCm == null ? null : Number(product.heightCm),
      depthCm: product.depthCm == null ? null : Number(product.depthCm),
      weight: product.weight == null ? null : Number(product.weight),
      isDiscontinued: product.isDiscontinued,
      isCrestronHomeCompatible: product.isCrestronHomeCompatible,
      vendorProductUrl: product.vendorProductUrl,
      specifications: product.specifications,
      keyFeatures: product.keyFeatures,
      aiProductType: product.aiProfile?.productType ?? null,
      aiMountTypes: product.aiProfile?.mountTypes ?? [],
      aiApplications: product.aiProfile?.applications ?? [],
      categoryName: product.category?.name ?? null,
      familyName: product.family?.name ?? null,
    });

    if (!draft.designRole && draft.completenessScore < 0.15) {
      skipped += 1;
      continue;
    }

    const data = {
      designRole: draft.designRole,
      roomCategories: draft.roomCategories,
      mountOptions: draft.mountOptions,
      defaultMountHeightM:
        draft.defaultMountHeightM == null
          ? null
          : new Prisma.Decimal(draft.defaultMountHeightM),
      widthM: draft.widthM == null ? null : new Prisma.Decimal(draft.widthM),
      heightM: draft.heightM == null ? null : new Prisma.Decimal(draft.heightM),
      depthM: draft.depthM == null ? null : new Prisma.Decimal(draft.depthM),
      weightKg:
        draft.weightKg == null ? null : new Prisma.Decimal(draft.weightKg),
      hfovDeg: draft.hfovDeg == null ? null : new Prisma.Decimal(draft.hfovDeg),
      vfovDeg: draft.vfovDeg == null ? null : new Prisma.Decimal(draft.vfovDeg),
      maxRangeM:
        draft.maxRangeM == null ? null : new Prisma.Decimal(draft.maxRangeM),
      micPattern: draft.micPattern,
      coverageRadiusM:
        draft.coverageRadiusM == null
          ? null
          : new Prisma.Decimal(draft.coverageRadiusM),
      diagonalIn:
        draft.diagonalIn == null ? null : new Prisma.Decimal(draft.diagonalIn),
      viewingDistanceMinM:
        draft.viewingDistanceMinM == null
          ? null
          : new Prisma.Decimal(draft.viewingDistanceMinM),
      viewingDistanceMaxM:
        draft.viewingDistanceMaxM == null
          ? null
          : new Prisma.Decimal(draft.viewingDistanceMaxM),
      proxyKey: draft.proxyKey,
      completenessScore: draft.completenessScore,
      confidenceScore: draft.confidenceScore,
      status: draft.status,
      fieldEvidence: draft.fieldEvidence as Prisma.InputJsonValue,
      lastEnrichedAt: new Date(),
    };

    await prisma.productDesignProfile.upsert({
      where: { productId: product.id },
      create: { productId: product.id, ...data },
      update: data,
    });
    upserted += 1;
  }

  const nextCursor =
    products.length === take ? products[products.length - 1]!.id : null;

  return {
    scanned: products.length,
    upserted,
    skipped,
    nextCursor,
  };
}

export async function designProfileStats() {
  await ensureRoomBuilderSchema();
  const [totalProducts, withProfile, byRole, byStatus] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.productDesignProfile.count(),
    prisma.productDesignProfile.groupBy({
      by: ["designRole"],
      _count: { _all: true },
      orderBy: { _count: { designRole: "desc" } },
    }),
    prisma.productDesignProfile.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return {
    totalProducts,
    withProfile,
    missing: Math.max(0, totalProducts - withProfile),
    byRole: byRole.map((r) => ({
      designRole: r.designRole,
      count: r._count._all,
    })),
    byStatus: byStatus.map((r) => ({
      status: r.status,
      count: r._count._all,
    })),
  };
}
