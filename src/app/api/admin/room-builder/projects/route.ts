import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  createHubProject,
  createSpaceProject,
  listRoomProjects,
  normalizeBrief,
} from "@/services/room-builder";
import { BRIEF_CONTROLS } from "@/services/room-builder/brief";
import { completeHubEquipment, completeSpaceEquipment } from "@/services/room-builder/equipment-complete";
import { getHubPreset } from "@/services/room-builder/hub-presets";
import { getRoomProject } from "@/services/room-builder/project-service";
import { defaultProjectSystem } from "@/services/room-builder/project-system";

export const dynamic = "force-dynamic";
/** Crear una obra completa elige productos para cada ambiente: puede tardar. */
export const maxDuration = 300;

/** Tipo de obra (para el equipamiento recomendado) según la categoría del preset. */
const KIND_BY_CATEGORY: Record<string, string> = { residential: "residencial", hotel: "hoteleria", videoconference: "corporativo", classroom: "educacion" };

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("space"),
    name: z.string().min(1).max(200),
    templateKey: z.string().min(1),
    areaM2: z.number().positive().optional(),
    widthM: z.number().positive().optional(),
    depthM: z.number().positive().optional(),
    heightM: z.number().positive().optional(),
    platform: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
    unitCount: z.number().int().positive().optional(),
    notes: z.string().max(4000).nullable().optional(),
    /** Respuestas del asistente; se validan con normalizeBrief. */
    brief: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal("hub"),
    name: z.string().min(1).max(200),
    hubPresetKey: z.string().min(1),
    clientId: z.string().nullable().optional(),
    spaceOverrides: z
      .array(
        z.object({
          templateKey: z.string(),
          name: z.string().optional(),
          unitCount: z.number().int().positive().optional(),
          areaM2: z.number().positive().optional(),
        }),
      )
      .optional(),
    /** Respuestas del asistente por ambiente del preset (se validan con normalizeBrief). */
    briefs: z.array(z.unknown()).max(40).optional(),
    /** Control de la obra: con Crestron Home el equipamiento queda central. */
    control: z.enum(BRIEF_CONTROLS).optional(),
    /** Elegir del catálogo el equipamiento central y lo que falte en cada ambiente. */
    complete: z.boolean().optional(),
  }),
]);

export async function GET() {
  const user = await requireAdmin();
  const projects = await listRoomProjects(user.id);
  return NextResponse.json({ ok: true, projects });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido" },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.kind === "hub") {
      const preset = getHubPreset(parsed.data.hubPresetKey);
      const control = parsed.data.control ?? "none";
      const project = await createHubProject({
        ownerId: user.id,
        name: parsed.data.name,
        hubPresetKey: parsed.data.hubPresetKey,
        clientId: parsed.data.clientId,
        spaceOverrides: parsed.data.spaceOverrides,
        briefs: parsed.data.briefs?.map((b) => normalizeBrief(b)),
        system: parsed.data.briefs?.length ? defaultProjectSystem(KIND_BY_CATEGORY[preset?.category ?? ""] ?? "otro", control) : null,
      });
      if (parsed.data.complete && project) {
        try {
          await completeHubEquipment(project.id);
          for (const child of project.children ?? []) await completeSpaceEquipment(child.id);
        } catch (error) {
          console.error("[room-builder/projects] completar equipos", error);
        }
      }
      return NextResponse.json({ ok: true, project: project ? await getRoomProject(project.id) : project });
    }

    const project = await createSpaceProject({
      ownerId: user.id,
      name: parsed.data.name,
      templateKey: parsed.data.templateKey,
      areaM2: parsed.data.areaM2,
      widthM: parsed.data.widthM,
      depthM: parsed.data.depthM,
      heightM: parsed.data.heightM,
      brief: parsed.data.brief === undefined ? null : normalizeBrief(parsed.data.brief),
      platform: parsed.data.platform,
      clientId: parsed.data.clientId,
      unitCount: parsed.data.unitCount,
      notes: parsed.data.notes,
    });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
