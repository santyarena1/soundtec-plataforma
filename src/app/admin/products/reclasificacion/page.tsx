import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { listCategoryTree } from "@/lib/category-tree";
import { tangoPathLabel, TANGO_SEPARATOR } from "@/lib/tango-tree";
import { TANGO_BATCH } from "@/server/category-proposals";
import { ProposalsBoard, type ProposalRow } from "./proposals-board";
import { BranchSuggestions, type BranchRow } from "./branch-suggestions";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const metadata = { title: "Admin · Reclasificación de rubros" };
export const maxDuration = 300;

const PAGE_SIZE = 100;
const STATUS = { pendientes: "PENDING", aprobadas: "APPROVED", rechazadas: "REJECTED" } as const;

type Search = { estado?: string; conf?: string; rubro?: string; marca?: string; q?: string; pagina?: string };

export default async function ReclassificationPage({ searchParams }: { searchParams: Search }) {
  await requireStaff("categories.manage");
  const estado = (searchParams.estado && searchParams.estado in STATUS ? searchParams.estado : "pendientes") as keyof typeof STATUS;
  const conf = ["alta", "media", "baja"].includes(searchParams.conf ?? "") ? searchParams.conf! : "";
  const rubro = searchParams.rubro ?? "";
  const marca = searchParams.marca ?? "";
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.pagina) || 1);

  const where: Prisma.CategoryProposalWhereInput = {
    batch: TANGO_BATCH,
    status: STATUS[estado],
    ...(conf ? { confidence: conf } : {}),
    ...(rubro ? { OR: [{ tangoPath: rubro }, { tangoPath: { startsWith: rubro + TANGO_SEPARATOR } }] } : {}),
    ...(marca || q
      ? {
          product: {
            ...(marca ? { brand: { name: marca } } : {}),
            ...(q ? { OR: [{ normalizedName: { contains: q, mode: "insensitive" } }, { internalSku: { contains: q } }, { originalName: { contains: q, mode: "insensitive" } }] } : {}),
          },
        }
      : {}),
  };

  const [total, counts, rows, rubros, brands, nodes] = await Promise.all([
    prisma.categoryProposal.count({ where: { batch: TANGO_BATCH } }),
    prisma.categoryProposal.groupBy({ by: ["status", "confidence"], where: { batch: TANGO_BATCH }, _count: { _all: true } }),
    prisma.categoryProposal.findMany({
      where,
      orderBy: [{ confidence: "asc" }, { product: { brand: { name: "asc" } } }, { product: { normalizedName: "asc" } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { id: true, normalizedName: true, internalSku: true, shortDescription: true, categoryId: true, brand: { select: { name: true } }, category: { select: { name: true, tangoPath: true } } } },
      },
    }),
    prisma.category.findMany({ where: { tangoPath: { not: null }, level: 1 }, orderBy: { name: "asc" }, select: { name: true, tangoPath: true } }),
    prisma.brand.findMany({ where: { products: { some: { categoryProposals: { some: { batch: TANGO_BATCH } } } } }, orderBy: { name: "asc" }, select: { name: true } }),
    listCategoryTree(),
  ]);
  const [branchRows, matching, previousCategories] = await Promise.all([
    prisma.tangoBranchSuggestion.findMany({ where: { batch: TANGO_BATCH }, orderBy: [{ status: "asc" }, { tangoPath: "asc" }] }).then(async (list) => {
      const sampleIds = list.flatMap((b) => b.productIds.slice(0, 5));
      const names = new Map((await prisma.product.findMany({ where: { id: { in: sampleIds } }, select: { id: true, normalizedName: true } })).map((p) => [p.id, p.normalizedName]));
      return list.map((b): BranchRow => {
        const parts = b.tangoPath.split(TANGO_SEPARATOR);
        return {
          id: b.id,
          path: b.tangoPath,
          parent: tangoPathLabel(parts.slice(0, -1).join(TANGO_SEPARATOR)),
          name: tangoPathLabel(parts[parts.length - 1]!),
          reason: b.reason,
          count: b.productIds.length,
          examples: b.productIds.slice(0, 5).map((id) => names.get(id)).filter((n): n is string => Boolean(n)),
          status: b.status,
        };
      });
    }),
    prisma.categoryProposal.count({ where }),
    prisma.category.findMany({ where: { id: { in: rows.map((r) => r.previousCategoryId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true, tangoPath: true } }),
  ]);
  const previousName = new Map(previousCategories.map((c) => [c.id, c.tangoPath ? tangoPathLabel(c.tangoPath) : c.name]));
  const count = (status: string, confidence?: string) =>
    counts.filter((c) => c.status === status && (!confidence || c.confidence === confidence)).reduce((a, c) => a + c._count._all, 0);

  const data: ProposalRow[] = rows.map((r) => ({
    id: r.id,
    productId: r.product.id,
    model: r.product.normalizedName,
    sku: r.product.internalSku,
    brand: r.product.brand?.name ?? null,
    description: r.product.shortDescription?.slice(0, 160) ?? null,
    current: r.product.category?.tangoPath ? tangoPathLabel(r.product.category.tangoPath) : r.product.category?.name ?? null,
    proposed: tangoPathLabel(r.tangoPath),
    applied: r.appliedPath ? tangoPathLabel(r.appliedPath) : null,
    confidence: r.confidence as ProposalRow["confidence"],
    note: r.note,
    status: r.status,
    previous: r.status === "APPROVED" ? (r.previousCategoryId ? previousName.get(r.previousCategoryId) ?? "Otra categoría" : "Sin rubro") : null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reclasificación con el árbol de Tango"
        description="Cada producto tiene un rubro propuesto (Rubro › Subrubro › Categoría › Tipo). Nada cambia hasta que lo aprobás; rechazar lo deja como está. No afecta precios."
      />
      {total > 0 ? <BranchSuggestions rows={branchRows} canLoad={existsSync(join(process.cwd(), "data", "tango", "ramas-sugeridas.json"))} /> : null}
      <ProposalsBoard
        loaded={total > 0}
        stats={{
          total,
          pending: count("PENDING"),
          pendingHigh: count("PENDING", "alta"),
          pendingMedium: count("PENDING", "media"),
          pendingLow: count("PENDING", "baja"),
          approved: count("APPROVED"),
          rejected: count("REJECTED"),
        }}
        filters={{ estado, conf, rubro, marca, q, page }}
        rubros={rubros.map((r) => ({ value: r.tangoPath!, label: r.name }))}
        brands={brands.map((b) => b.name)}
        rows={data}
        matching={matching}
        pageSize={PAGE_SIZE}
        nodes={nodes}
      />
    </div>
  );
}
