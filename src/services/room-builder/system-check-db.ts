/**
 * Motor de sistema contra la base: carga especificaciones y reglas, corre el
 * chequeo de un proyecto y convierte las sugerencias en productos concretos
 * del catálogo (con la acción para agregarlos).
 */

import { prisma } from "@/lib/prisma";
import type { RoomBrief } from "./brief";
import { ensureRoomBuilderSchema } from "./ensure-schema";
import { INTEGRATION_SEED, type ControlPlatform, type IntegrationMethod, type IntegrationRule } from "./integrations";
import { getRoomProject } from "./project-service";
import { AMPLIFIER_MATCH } from "./rank-from-db";
import { parseScene } from "./scene";
import { runSystemCheck, type CheckDevice, type Finding, type Suggestion } from "./system-check";
import { deriveSystemSpec, type SpecKind, type SystemSpec } from "./system-specs";

export type FindingAction =
  | { type: "assign"; slotKey: string; productId: string; quantity: number; label: string; imageUrl: string | null; priceUsd: number | null }
  | { type: "add"; productId: string; quantity: number; label: string; imageUrl: string | null; priceUsd: number | null };

export type ResolvedFinding = Finding & { actions: FindingAction[] };

const SUGGESTIONS_PER_FINDING = 3;
const AMP_CANDIDATES = 300;

export const SPEC_PRODUCT_SELECT = {
  id: true,
  normalizedName: true,
  baseCostUsd: true,
  brand: { select: { slug: true, name: true } },
  designProfile: { select: { designRole: true } },
  aiProfile: { select: { productType: true, powerWatts: true, impedanceOhms: true, audioLine: true } },
  systemSpec: true,
  images: { where: { isPrimary: true }, select: { url: true }, take: 1 },
} as const;

export type SpecProduct = {
  id: string;
  normalizedName: string;
  baseCostUsd: unknown;
  brand: { slug: string; name: string } | null;
  designProfile: { designRole: string | null } | null;
  aiProfile: { productType: string | null; powerWatts: unknown; impedanceOhms: unknown; audioLine: string | null } | null;
  systemSpec: {
    kind: string;
    channels: number | null;
    wattsPerChannel: number | null;
    minOhms: unknown;
    nominalOhms: unknown;
    highImpedance: boolean;
    streaming: boolean;
    networked: boolean;
  } | null;
  images: Array<{ url: string }>;
};

const num = (v: unknown) => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Especificación efectiva: la cargada a mano gana; si no, la deducida. */
export function effectiveSpec(p: SpecProduct): SystemSpec {
  if (p.systemSpec) {
    const s = p.systemSpec;
    return {
      kind: s.kind as SpecKind,
      channels: s.channels,
      wattsPerChannel: s.wattsPerChannel,
      minOhms: num(s.minOhms),
      nominalOhms: num(s.nominalOhms),
      highImpedance: s.highImpedance,
      streaming: s.streaming,
      networked: s.networked,
      source: "manual",
    };
  }
  return deriveSystemSpec({
    name: p.normalizedName,
    brandSlug: p.brand?.slug ?? null,
    designRole: p.designProfile?.designRole ?? null,
    ai: p.aiProfile
      ? { productType: p.aiProfile.productType, powerWatts: num(p.aiProfile.powerWatts), impedanceOhms: num(p.aiProfile.impedanceOhms), audioLine: p.aiProfile.audioLine }
      : null,
  });
}

/** Reglas de integración; la primera vez se precargan (a confirmar). */
export async function loadIntegrationRules(): Promise<IntegrationRule[]> {
  await ensureRoomBuilderSchema();
  if ((await prisma.controlIntegration.count()) === 0) {
    await prisma.controlIntegration.createMany({ data: INTEGRATION_SEED });
  }
  const rows = await prisma.controlIntegration.findMany({ orderBy: [{ brandSlug: "asc" }, { platform: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    brandSlug: r.brandSlug,
    productMatch: r.productMatch,
    platform: r.platform as ControlPlatform,
    method: r.method as IntegrationMethod,
    requirement: r.requirement,
    needsNetwork: r.needsNetwork,
    verified: r.verified,
    notes: r.notes,
  }));
}

const label = (p: SpecProduct) => `${p.brand?.name ? `${p.brand.name} · ` : ""}${p.normalizedName}`;
const price = (p: SpecProduct) => num(p.baseCostUsd);

function byPreference(preferred: string[]) {
  return (a: SpecProduct, b: SpecProduct) =>
    Number(preferred.includes(b.brand?.slug ?? "")) - Number(preferred.includes(a.brand?.slug ?? "")) ||
    (price(a) ?? Number.MAX_SAFE_INTEGER) - (price(b) ?? Number.MAX_SAFE_INTEGER);
}

async function amplifierActions(s: Extract<Suggestion, { kind: "amplifier" }>, brief: RoomBrief | null, current: SpecProduct | null): Promise<FindingAction[]> {
  const rows = (await prisma.product.findMany({
    where: { isActive: true, isDiscontinued: false, OR: AMPLIFIER_MATCH },
    select: SPEC_PRODUCT_SELECT,
    take: AMP_CANDIDATES,
  })) as unknown as SpecProduct[];
  const fits = rows
    .map((p) => ({ p, spec: effectiveSpec(p) }))
    .filter(({ p, spec }) => p.id !== s.currentProductId && spec.kind === "amplifier" && (spec.channels ?? 0) >= s.minChannels && (!s.networked || spec.networked))
    .sort((a, b) => byPreference(brief?.brands.amplification ?? [])(a.p, b.p) || (a.spec.channels ?? 0) - (b.spec.channels ?? 0))
    .slice(0, SUGGESTIONS_PER_FINDING);
  const actions: FindingAction[] = fits.map(({ p, spec }) => ({
    type: "assign",
    slotKey: s.slotKey,
    productId: p.id,
    quantity: 1,
    label: `Usar ${label(p)} (${spec.channels} canales)`,
    imageUrl: p.images[0]?.url ?? null,
    priceUsd: price(p),
  }));
  if (current && s.sameQuantity && s.sameQuantity > 1) {
    actions.unshift({
      type: "assign",
      slotKey: s.slotKey,
      productId: current.id,
      quantity: s.sameQuantity,
      label: `Usar ${s.sameQuantity} × ${label(current)}`,
      imageUrl: current.images[0]?.url ?? null,
      priceUsd: price(current),
    });
  }
  return actions;
}

async function searchActions(terms: string[], preferred: string[], kind: SpecKind, quantity = 1): Promise<FindingAction[]> {
  const rows = (await prisma.product.findMany({
    where: { isActive: true, isDiscontinued: false, OR: terms.map((t) => ({ normalizedName: { contains: t, mode: "insensitive" as const } })) },
    select: SPEC_PRODUCT_SELECT,
    take: 60,
  })) as unknown as SpecProduct[];
  return rows
    .filter((p) => {
      const spec = effectiveSpec(p);
      // Un amplificador con streaming integrado también resuelve la fuente.
      return kind === "streamer" ? spec.streaming : spec.kind === kind;
    })
    .sort(byPreference(preferred))
    .slice(0, SUGGESTIONS_PER_FINDING)
    .map((p) => ({ type: "add", productId: p.id, quantity, label: `Agregar ${label(p)}`, imageUrl: p.images[0]?.url ?? null, priceUsd: price(p) }));
}

const STREAMER_TERMS = ["NODE", "BluOS", "streamer", "DM-NAX-AMP", "ZSA"];
const SWITCH_TERMS = ["switch"];

/** Chequeo completo de un ambiente con sus acciones sugeridas. */
export async function analyzeProjectSystem(projectId: string): Promise<{ findings: ResolvedFinding[]; brief: RoomBrief | null } | null> {
  const project = await getRoomProject(projectId);
  if (!project || project.kind === "hub") return null;
  const scene = parseScene(project.sceneJson);
  if (!scene) return null;
  const brief = scene.brief ?? null;

  const productIds = [...new Set(scene.devices.map((d) => d.productId).filter((id): id is string => Boolean(id)))];
  const products = (await prisma.product.findMany({ where: { id: { in: productIds } }, select: SPEC_PRODUCT_SELECT })) as unknown as SpecProduct[];
  const byId = new Map(products.map((p) => [p.id, p]));

  const devices: CheckDevice[] = scene.devices.map((d) => {
    const p = d.productId ? byId.get(d.productId) : undefined;
    return {
      slotKey: d.slotKey,
      role: d.designRole,
      label: d.label,
      quantity: Math.max(1, d.quantity || 1),
      // Un genérico cuenta como equipo elegido (no es un lugar vacío), aunque no sea del catálogo.
      product: p ? { id: p.id, name: p.normalizedName, brandSlug: p.brand?.slug ?? null, brandName: p.brand?.name ?? null } : d.generic ? { id: `generic:${d.generic.key}`, name: d.generic.name, brandSlug: null, brandName: null } : null,
      spec: p ? effectiveSpec(p) : null,
    };
  });

  const rules = await loadIntegrationRules();
  const findings = runSystemCheck(devices, brief, rules);
  const resolved = await Promise.all(
    findings.map(async (f): Promise<ResolvedFinding> => {
      const s = f.suggestion;
      if (!s) return { ...f, actions: [] };
      if (s.kind === "amplifier") {
        return { ...f, actions: await amplifierActions(s, brief, s.currentProductId ? (byId.get(s.currentProductId) ?? null) : null) };
      }
      if (s.kind === "streamer") return { ...f, actions: await searchActions(STREAMER_TERMS, brief?.brands.streaming ?? [], "streamer") };
      return { ...f, actions: await searchActions(SWITCH_TERMS, brief?.brands.control ?? ["crestron"], "switch") };
    }),
  );
  return { findings: resolved, brief };
}

/** Suma un producto sugerido al proyecto como ítem propio (sin lugar fijo en la sala). */
export async function addProductToProject(projectId: string, productId: string, quantity: number) {
  const { assignProductToSlot, updateRoomProjectScene } = await import("./project-service");
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { normalizedName: true, designProfile: { select: { designRole: true } } },
  });
  if (!product) throw new Error("Producto no encontrado");

  const slotKey = `bom_${productId.slice(-8)}`;
  const qty = Math.max(1, Math.min(48, Math.round(quantity)));
  if (!scene.slots.some((s) => s.key === slotKey)) {
    const role = (product.designProfile?.designRole ?? "other") as never;
    const pose = { x: 0, y: 0.4, z: -scene.depthM / 2 + 0.3, rotY: 0 };
    scene.slots.push({ key: slotKey, role, label: product.normalizedName, required: false, mount: "rack", pose, defaultQty: qty });
    scene.devices.push({
      id: `slot-${slotKey}`,
      slotKey,
      productId: null,
      designRole: role,
      label: product.normalizedName,
      quantity: qty,
      pose,
      coverage: null,
    });
    await updateRoomProjectScene(projectId, scene);
  }
  await assignProductToSlot({ projectId, slotKey, productId, quantity: qty });
  return getRoomProject(projectId);
}
