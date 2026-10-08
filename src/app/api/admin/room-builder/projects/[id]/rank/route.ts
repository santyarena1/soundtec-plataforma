import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
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

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
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
  });

  return NextResponse.json({
    ok: true,
    role: effectiveRole,
    mount: effectiveMount,
    mode,
    ranked,
  });
}
