import { prisma } from "@/lib/prisma";
import {
  cameraCoverageFit,
  displayViewingFit,
  micCoverageFit,
  viewingDistanceFromDiagonalIn,
} from "./coverage";
import { ensureRoomBuilderSchema } from "./ensure-schema";
import { rankForSlot, type SlotRequirements } from "./ranking";
import type { DesignRole, MountOption, RankCandidate, RankSortMode } from "./types";

function stockScore(status: string | null | undefined): number {
  switch (status) {
    case "IN_STOCK":
      return 1;
    case "LOW_STOCK":
      return 0.7;
    case "ON_REQUEST":
      return 0.45;
    case "OUT_OF_STOCK":
      return 0.15;
    default:
      return 0.35;
  }
}

function typologyFit(
  roomCategories: string[],
  projectCategory: string | null | undefined,
): number {
  if (!projectCategory) return 0.55;
  if (roomCategories.includes(projectCategory)) return 1;
  if (roomCategories.length === 0) return 0.5;
  return 0.25;
}

export type RankFromDbOptions = {
  role: DesignRole;
  mount: MountOption;
  projectCategory?: string | null;
  mode?: RankSortMode;
  roomDepthM?: number;
  roomWidthM?: number;
  limit?: number;
  q?: string;
};

export async function rankProductsForSlot(options: RankFromDbOptions) {
  await ensureRoomBuilderSchema();
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const slot: SlotRequirements = {
    role: options.role,
    mount: options.mount,
    prefersCoverage: true,
  };

  const profiles = await prisma.productDesignProfile.findMany({
    where: {
      designRole: options.role,
      product: {
        isActive: true,
        isDiscontinued: false,
        ...(options.q
          ? {
              OR: [
                {
                  normalizedName: {
                    contains: options.q,
                    mode: "insensitive",
                  },
                },
                {
                  supplierSku: { contains: options.q, mode: "insensitive" },
                },
                { modelNumber: { contains: options.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    },
    take: Math.max(limit * 4, 80),
    orderBy: [{ completenessScore: "desc" }, { updatedAt: "desc" }],
    include: {
      product: {
        select: {
          id: true,
          normalizedName: true,
          supplierSku: true,
          modelNumber: true,
          baseCostUsd: true,
          listPriceUsd: true,
          stockStatus: true,
          isDiscontinued: true,
          brand: { select: { name: true, slug: true } },
          images: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
        },
      },
    },
  });

  const roomDepth = options.roomDepthM ?? 5;
  const roomWidth = options.roomWidthM ?? 4;

  const candidates: RankCandidate[] = profiles.map((profile) => {
    const mounts = (profile.mountOptions ?? []).filter((m): m is MountOption =>
      ["wall", "ceiling", "table", "rack", "floor"].includes(m),
    );

    let coverageFit: number | null = null;
    if (options.role === "camera" && profile.hfovDeg != null) {
      coverageFit = cameraCoverageFit({
        hfovDeg: Number(profile.hfovDeg),
        maxRangeM:
          profile.maxRangeM == null ? undefined : Number(profile.maxRangeM),
        targetWidthM: Math.max(1.2, roomWidth * 0.55),
        distanceM: Math.max(1.2, roomDepth * 0.65),
      });
    } else if (options.role === "mic" && profile.coverageRadiusM != null) {
      const zoneRadiusM =
        Math.sqrt(roomWidth * roomWidth + roomDepth * roomDepth) / 4;
      coverageFit = micCoverageFit({
        radiusM: Number(profile.coverageRadiusM),
        zoneRadiusM: Math.max(1, zoneRadiusM),
      });
    } else if (options.role === "display") {
      let viewMin =
        profile.viewingDistanceMinM == null
          ? null
          : Number(profile.viewingDistanceMinM);
      let viewMax =
        profile.viewingDistanceMaxM == null
          ? null
          : Number(profile.viewingDistanceMaxM);
      if (
        (viewMin == null || viewMax == null) &&
        profile.diagonalIn != null
      ) {
        const derived = viewingDistanceFromDiagonalIn(Number(profile.diagonalIn));
        viewMin = viewMin ?? derived.viewMinM;
        viewMax = viewMax ?? derived.viewMaxM;
      }
      coverageFit = displayViewingFit({
        viewMinM: viewMin,
        viewMaxM: viewMax,
        seatingDistanceM: roomDepth * 0.55,
      });
    }

    return {
      productId: profile.productId,
      designRole: (profile.designRole as DesignRole) ?? null,
      mountOptions: mounts,
      priceUsd: Number(profile.product.baseCostUsd),
      stockScore: stockScore(profile.product.stockStatus),
      coverageFit,
      typologyFit: typologyFit(profile.roomCategories, options.projectCategory),
      dataCompleteness: profile.completenessScore,
      discontinued: profile.product.isDiscontinued,
      brandBoost: profile.product.brand?.slug === "crestron" ? 0.15 : 0.05,
    };
  });

  const ranked = rankForSlot(candidates, slot, options.mode ?? "recommended").slice(
    0,
    limit,
  );

  const byId = new Map(profiles.map((p) => [p.productId, p]));

  return ranked.map((row) => {
    const profile = byId.get(row.productId)!;
    return {
      ...row,
      name: profile.product.normalizedName,
      sku: profile.product.supplierSku ?? profile.product.modelNumber,
      brand: profile.product.brand?.name ?? null,
      imageUrl: profile.product.images[0]?.url ?? null,
      listPriceUsd:
        profile.product.listPriceUsd == null
          ? null
          : Number(profile.product.listPriceUsd),
      hfovDeg: profile.hfovDeg == null ? null : Number(profile.hfovDeg),
      maxRangeM: profile.maxRangeM == null ? null : Number(profile.maxRangeM),
      coverageRadiusM:
        profile.coverageRadiusM == null
          ? null
          : Number(profile.coverageRadiusM),
      diagonalIn: profile.diagonalIn == null ? null : Number(profile.diagonalIn),
      completenessScore: profile.completenessScore,
      mountOptions: profile.mountOptions,
    };
  });
}
