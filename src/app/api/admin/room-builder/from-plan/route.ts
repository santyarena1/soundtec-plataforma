import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND_GROUPS, BRIEF_CONTROLS, BRIEF_TIERS, BRIEF_VC_PLATFORMS } from "@/services/room-builder/brief";
import { PLAN_KINDS } from "@/services/room-builder/plan-analysis";
import { createProjectFromPlan } from "@/services/room-builder/plan-project";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Crea varios ambientes con productos sugeridos: puede tardar. */
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DATA_URL_PREFIX = "data:image/webp;base64,";

const box = z.object({ x0: z.number().min(0).max(1), y0: z.number().min(0).max(1), x1: z.number().min(0).max(1), y1: z.number().min(0).max(1) });
const slug = z.string().regex(/^[a-z0-9-]{1,60}$/);

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(PLAN_KINDS),
  image: z.object({ dataUrl: z.string().startsWith(DATA_URL_PREFIX), widthPx: z.number().int().positive().max(10000), heightPx: z.number().int().positive().max(10000) }),
  heightM: z.number().min(2.2).max(12),
  control: z.enum(BRIEF_CONTROLS),
  vcPlatform: z.enum(BRIEF_VC_PLATFORMS).nullable(),
  tier: z.enum(BRIEF_TIERS),
  brands: z.record(z.enum(BRAND_GROUPS), z.array(slug).max(12)).default({}),
  rooms: z
    .array(z.object({ name: z.string().trim().min(1).max(60), templateKey: z.string().min(1).max(60), box, widthM: z.number().min(1).max(200), depthM: z.number().min(1).max(200) }))
    .min(1)
    .max(40),
});

/** Genera el proyecto completo (todos los ambientes) a partir del plano revisado. */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const data = Buffer.from(parsed.data.image.dataUrl.slice(DATA_URL_PREFIX.length), "base64");
  if (!data.length || data.length > MAX_IMAGE_BYTES) return NextResponse.json({ ok: false, error: "Imagen del plano inválida" }, { status: 400 });
  try {
    const project = await createProjectFromPlan({
      ownerId: user.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      image: { data, widthPx: parsed.data.image.widthPx, heightPx: parsed.data.image.heightPx },
      heightM: parsed.data.heightM,
      control: parsed.data.control,
      vcPlatform: parsed.data.vcPlatform,
      tier: parsed.data.tier,
      brands: parsed.data.brands,
      rooms: parsed.data.rooms,
    });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    console.error("[room-builder/from-plan]", error);
    const message = error instanceof Error ? error.message : "No se pudo crear el proyecto";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
