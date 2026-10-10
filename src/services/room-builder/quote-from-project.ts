import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent, getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { createQuoteShell } from "@/server/actions/quotes";
import { getRoomProject } from "./project-service";
import { loadCableCatalog } from "./cable-catalog";
import { pickCables, type CableProduct } from "./cable-picks";
import { cablingProfile } from "./cabling-db";
import { cablingForScene } from "./cabling-scene";
import { parseScene } from "./scene";
import { genericMissing, type GenericInfo } from "./generic/library";

type BomLine = {
  productId: string;
  quantity: number;
  note: string;
};

function accumulateBom(
  lines: BomLine[],
  productId: string,
  quantity: number,
  note: string,
) {
  const existing = lines.find((l) => l.productId === productId && l.note === note);
  if (existing) {
    existing.quantity += quantity;
  } else {
    lines.push({ productId, quantity, note });
  }
}

/** Agrega BOM de un espacio (respeta unitCount) y de hijos si es hub. */
export async function buildProjectBom(projectId: string): Promise<BomLine[]> {
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");

  const lines: BomLine[] = [];
  let cableCatalog: CableProduct[] | null = null;

  async function addSpace(spaceId: string) {
    const space = await getRoomProject(spaceId);
    if (!space || space.kind === "hub") return;
    const mult = Math.max(1, space.unitCount);
    for (const device of space.devices) {
      if (!device.productId) continue;
      accumulateBom(
        lines,
        device.productId,
        device.quantity * mult,
        `${space.name} · ${device.slotKey ?? device.designRole ?? "slot"}`,
      );
    }
    // Cableado del ambiente: los mismos cables y metros que muestra la pestaña Cableado.
    const scene = parseScene(space.sceneJson);
    const profile = scene ? await cablingProfile(space.id) : null;
    if (scene && profile) {
      cableCatalog ??= await loadCableCatalog();
      const { lines: cables } = pickCables(cablingForScene(scene, space.category, profile), cableCatalog);
      for (const c of cables) accumulateBom(lines, c.product.id, c.quantity * mult, `${space.name} · Cableado · ${c.note}`);
    }
  }

  if (project.kind === "hub") {
    for (const child of project.children) {
      await addSpace(child.id);
    }
    // Equipamiento central del proyecto (amplificación, procesador, streaming, red).
    for (const device of project.devices) {
      if (!device.productId) continue;
      accumulateBom(lines, device.productId, device.quantity, `Equipamiento central · ${device.slotKey ?? "equipo"}`);
    }
  } else {
    await addSpace(project.id);
  }

  return lines;
}

/** Equipo genérico a cotizar: no es del catálogo, lleva su precio y descripción cargados a mano. */
export type GenericBomLine = { generic: GenericInfo; quantity: number; note: string };

/** Genéricos del proyecto (de cada ambiente, por su cantidad de unidades). */
export async function buildGenericBom(projectId: string): Promise<GenericBomLine[]> {
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  const spaces = project.kind === "hub" ? await Promise.all(project.children.map((c) => getRoomProject(c.id))) : [project];
  const out: GenericBomLine[] = [];
  for (const space of [...spaces, ...(project.kind === "hub" ? [project] : [])]) {
    if (!space) continue;
    const scene = parseScene(space.sceneJson);
    const mult = space.kind === "hub" ? 1 : Math.max(1, space.unitCount);
    for (const d of scene?.devices ?? []) {
      if (!d.generic) continue;
      out.push({ generic: d.generic, quantity: Math.max(1, d.quantity || 1) * mult, note: `${space.name} · genérico` });
    }
  }
  return out;
}

export async function createQuoteFromRoomProject(input: {
  projectId: string;
  ownerId: string;
  clientId?: string | null;
  reference?: string;
}) {
  const project = await getRoomProject(input.projectId);
  if (!project) throw new Error("Proyecto no encontrado");

  const bom = await buildProjectBom(input.projectId);
  const generics = await buildGenericBom(input.projectId);
  if (bom.length === 0 && generics.length === 0) {
    throw new Error("No hay productos asignados para cotizar");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: bom.map((b) => b.productId) } },
    select: {
      id: true,
      normalizedName: true,
      brandId: true,
      distributorId: true,
      categoryId: true,
      familyId: true,
      baseCostUsd: true,
      discountPercent: true,
      tariffDutyPercent: true,
      coefNac: true,
      coefVta: true,
      coefVtaFob: true,
      ivaPercent: true,
      impIntPercent: true,
      brand: { select: { name: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const prices = await calculatePricesForProducts(
    products.map((p) => ({
      productId: p.id,
      baseCostUsd: Number(p.baseCostUsd),
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      productDiscountPercent:
        p.discountPercent == null ? null : Number(p.discountPercent),
      tariffDutyPercent:
        p.tariffDutyPercent == null ? null : Number(p.tariffDutyPercent),
      coefNac: p.coefNac == null ? null : Number(p.coefNac),
      coefVta: p.coefVta == null ? null : Number(p.coefVta),
      coefVtaFob: p.coefVtaFob == null ? null : Number(p.coefVtaFob),
      ivaPercent: p.ivaPercent == null ? null : Number(p.ivaPercent),
      impIntPercent: p.impIntPercent == null ? null : Number(p.impIntPercent),
    })),
    input.clientId ?? project.clientId ?? null,
    await getGlobalMarginPercent(),
  );

  const quote = await createQuoteShell({
    ownerId: input.ownerId,
    clientId: input.clientId ?? project.clientId ?? null,
    reference: input.reference ?? `Room Builder · ${project.name}`,
    projectType: project.category,
    brief: `Generado desde Room Builder (${project.kind})`,
    layoutKey: "STANDARD",
    profileKey: "tecnico",
    revisionSummary: `Alta desde Room Builder ${project.name}`,
  });

  const alternative = quote.alternatives[0];
  const defaultIva = Number(await getSetting(QUOTE_SETTING_KEYS.defaultIva, "21")) || 21;

  await prisma.quoteItem.createMany({
    data: bom.map((line, index) => {
      const product = byId.get(line.productId)!;
      const unit = prices.get(line.productId)?.finalPriceUsd ?? 0;
      return {
        quoteId: quote.id,
        alternativeId: alternative?.id,
        productId: line.productId,
        kind: "PRODUCT",
        quantity: new Prisma.Decimal(line.quantity),
        unit: "u",
        description: [product.brand?.name, product.normalizedName]
          .filter(Boolean)
          .join(" — "),
        unitPriceUsd: new Prisma.Decimal(unit),
        lineTotalUsd: new Prisma.Decimal(unit * line.quantity),
        priceOverridden: false,
        ivaRate: new Prisma.Decimal(
          product.ivaPercent == null ? defaultIva : Number(product.ivaPercent),
        ),
        source: "MANUAL",
        sortOrder: index,
        notes: line.note,
      };
    }),
  });

  // Genéricos: ítems sin producto del catálogo; lo que falte queda marcado para completar.
  if (generics.length) {
    await prisma.quoteItem.createMany({
      data: generics.map((g, i) => {
        const unit = g.generic.priceUsd ?? 0;
        const missing = genericMissing(g.generic);
        return {
          quoteId: quote.id,
          alternativeId: alternative?.id,
          productId: null,
          kind: "PRODUCT" as const,
          quantity: new Prisma.Decimal(g.quantity),
          unit: "u",
          description: [g.generic.name, g.generic.description?.trim() || "A COMPLETAR: descripción"].join(" — "),
          unitPriceUsd: new Prisma.Decimal(unit),
          lineTotalUsd: new Prisma.Decimal(unit * g.quantity),
          priceOverridden: g.generic.priceUsd != null,
          ivaRate: new Prisma.Decimal(defaultIva),
          source: "MANUAL" as const,
          sortOrder: bom.length + i,
          notes: missing.length ? `${g.note} · A COMPLETAR: ${missing.join(", ")}` : g.note,
        };
      }),
    });
  }

  await prisma.roomProject.update({
    where: { id: project.id },
    data: { quoteId: quote.id, status: "quoted" },
  });

  return { quoteId: quote.id, number: quote.number, lines: bom.length + generics.length };
}
