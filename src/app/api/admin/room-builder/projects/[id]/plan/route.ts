import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  boundsFromPolygon,
  computeMetersPerPixel,
  getRoomProject,
  parseScene,
  pxToMeters,
  rectangleFloor,
  updateRoomProjectScene,
  wallsFromPolygon,
  type PlanModeState,
  type PlanPoint,
} from "@/services/room-builder";

export const dynamic = "force-dynamic";

const calibrateSchema = z.object({
  action: z.literal("calibrate"),
  imageWidthPx: z.number().positive(),
  imageHeightPx: z.number().positive(),
  p1: z.object({ x: z.number(), y: z.number() }),
  p2: z.object({ x: z.number(), y: z.number() }),
  realMeters: z.number().positive(),
  heightM: z.number().positive().optional(),
  /** puntos del perímetro en px (opcional; si no, rectángulo del área actual) */
  polygonPx: z.array(z.object({ x: z.number(), y: z.number() })).min(3).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const project = await getRoomProject(params.id);
  if (!project || project.kind === "hub") {
    return NextResponse.json({ ok: false, error: "Proyecto inválido" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  // Upload de imagen de plano
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file requerido" }, { status: 400 });
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      return NextResponse.json(
        { ok: false, error: "Usá PNG/JPG/WebP (PDF página como imagen)" },
        { status: 400 },
      );
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Máximo 12 MB" }, { status: 400 });
    }

    const blob = await put(
      `room-builder/plans/${params.id}/${Date.now()}-${file.name}`,
      file,
      { access: "public", addRandomSuffix: true },
    );

    const scene = parseScene(project.sceneJson);
    if (!scene) {
      return NextResponse.json({ ok: false, error: "Escena inválida" }, { status: 400 });
    }

    const plan: PlanModeState = {
      enabled: true,
      imageUrl: blob.url,
      metersPerPixel: 0.01,
      imageWidthPx: Number(form.get("imageWidthPx") ?? 1000),
      imageHeightPx: Number(form.get("imageHeightPx") ?? 1000),
      heightM: scene.heightM,
      walls: [],
      floorPolygon: rectangleFloor(scene.widthM, scene.depthM),
    };
    scene.plan = plan;
    scene.cameraPreset = "plan";
    await updateRoomProjectScene(params.id, scene);
    const fresh = await getRoomProject(params.id);
    return NextResponse.json({ ok: true, project: fresh, imageUrl: blob.url });
  }

  const body = await req.json().catch(() => null);
  const parsed = calibrateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });
  }

  const scene = parseScene(project.sceneJson);
  if (!scene?.plan?.imageUrl) {
    return NextResponse.json(
      { ok: false, error: "Subí un plano antes de calibrar" },
      { status: 400 },
    );
  }

  const mpp = computeMetersPerPixel({
    p1: parsed.data.p1,
    p2: parsed.data.p2,
    realMeters: parsed.data.realMeters,
  });

  let floorPolygon: PlanPoint[];
  if (parsed.data.polygonPx?.length) {
    floorPolygon = parsed.data.polygonPx.map((p) =>
      pxToMeters(
        p,
        parsed.data.imageWidthPx,
        parsed.data.imageHeightPx,
        mpp,
      ),
    );
  } else {
    floorPolygon = rectangleFloor(scene.widthM, scene.depthM);
  }

  const bounds = boundsFromPolygon(floorPolygon);
  const walls = wallsFromPolygon(floorPolygon);
  const heightM = parsed.data.heightM ?? scene.heightM;

  scene.plan = {
    enabled: true,
    imageUrl: scene.plan.imageUrl,
    metersPerPixel: mpp,
    imageWidthPx: parsed.data.imageWidthPx,
    imageHeightPx: parsed.data.imageHeightPx,
    heightM,
    walls,
    floorPolygon,
  };
  scene.widthM = bounds.widthM;
  scene.depthM = bounds.depthM;
  scene.areaM2 = bounds.areaM2;
  scene.heightM = heightM;
  scene.cameraPreset = "plan";

  await updateRoomProjectScene(params.id, scene, {
    areaM2: bounds.areaM2,
    heightM,
  });

  // Reescalar poses de slots al nuevo tamaño (proporcional al centro)
  await prisma.roomProject.update({
    where: { id: params.id },
    data: { areaM2: bounds.areaM2, heightM },
  });

  const fresh = await getRoomProject(params.id);
  return NextResponse.json({ ok: true, project: fresh, bounds });
}
