import { NextRequest, NextResponse } from "next/server";
import { requireRoomProjectAccess } from "@/server/room-builder/access";
import {
  DESIGN_ROLES,
  MOUNT_OPTIONS,
  getRoomProject,
  parseScene,
  preferredBrandsForSlot,
  processorKindForSlot,
  rankModeForTier,
  rankProductsForSlot,
  type DesignRole,
  type MountOption,
  type RankSortMode,
} from "@/services/room-builder";
import { fitContextFor, kitIncludesTouch } from "@/services/room-builder/role-fit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireRoomProjectAccess(params.id);
  const project = await getRoomProject(params.id);
  if (!project) {
    return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
  }

  const role = req.nextUrl.searchParams.get("role") as DesignRole | null;
  const mount = (req.nextUrl.searchParams.get("mount") ?? "wall") as MountOption;
  const modeParam = req.nextUrl.searchParams.get("mode") as RankSortMode | null;
  const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;
  const slotKey = req.nextUrl.searchParams.get("slotKey");

  const scene = parseScene(project.sceneJson);
  const slot = slotKey
    ? scene?.slots.find((s) => s.key === slotKey)
    : undefined;

  const effectiveRole = role ?? (slot?.role as DesignRole | undefined);
  const effectiveMount = (slot?.mount as MountOption | undefined) ?? mount;

  if (!effectiveRole || !DESIGN_ROLES.includes(effectiveRole)) {
    return NextResponse.json(
      { ok: false, error: "role inválido" },
      { status: 400 },
    );
  }
  if (!MOUNT_OPTIONS.includes(effectiveMount)) {
    return NextResponse.json(
      { ok: false, error: "mount inválido" },
      { status: 400 },
    );
  }

  const brief = scene?.brief ?? null;
  // Equipo agregado (por el sistema o a mano) con producto: "Cambiar por otro" sugiere solo su misma clase.
  const device = slot ? scene?.devices.find((d) => d.slotKey === slot.key) : undefined;
  const added = Boolean(slot && (slot.key.startsWith("custom_") || slot.key.startsWith("bom_") || device?.addedBy === "system"));
  const current = added && device?.productId ? await prisma.product.findUnique({ where: { id: device.productId }, select: { normalizedName: true, aiProfile: { select: { productType: true } } } }) : null;
  // Touch de la sala: si el kit del códec ya trae el suyo, los paneles quedan como "no hace falta".
  const codecIds = slot?.role === "touch" ? (scene?.devices ?? []).filter((d) => d.designRole === "codec" && d.productId).map((d) => d.productId!) : [];
  const codecs = codecIds.length ? await prisma.product.findMany({ where: { id: { in: codecIds } }, select: { normalizedName: true, aiProfile: { select: { summaryEs: true } } } }) : [];
  const codecHasTouch = codecs.some((c) => kitIncludesTouch({ name: c.normalizedName, summary: c.aiProfile?.summaryEs ?? null }));
  const mode: RankSortMode = modeParam ?? (brief ? rankModeForTier(brief.tier) : "recommended");
  const ranked = await rankProductsForSlot({
    role: effectiveRole,
    mount: effectiveMount,
    projectCategory: project.category,
    mode,
    roomDepthM: scene?.depthM ?? 5,
    roomWidthM: scene?.widthM ?? 4,
    q,
    limit: 40,
    processorKind: processorKindForSlot(slot?.key ?? "", effectiveRole),
    preferredBrands: preferredBrandsForSlot(brief, effectiveRole, slot?.key ?? ""),
    // El lugar define el tipo puntual (teclado, subwoofer, exterior…), igual que al autocompletar.
    slotKey: slot?.key,
    slotLabel: slot?.label,
    // Los que no cumplen el papel del lugar (tipo o conexiones) quedan al final, con el motivo.
    fit: { ...fitContextFor({ brief, category: project.category, templateKey: project.templateKey, slotKey: slot?.key, slots: scene?.slots }), codecHasTouch },
    sameKindAs: current ? { productType: current.aiProfile?.productType ?? null, name: current.normalizedName } : null,
  });

  return NextResponse.json({
    ok: true,
    role: effectiveRole,
    mount: effectiveMount,
    mode,
    ranked,
  });
}
