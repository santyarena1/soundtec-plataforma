import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
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
  resizeSceneMeters,
  updateRoomProjectScene,
  wallsFromPolygon,
  type PlanModeState,
  type PlanPoint,
} from "@/services/room-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Lado mayor del plano guardado: nítido para calibrar, liviano para la base. */
const PLAN_MAX_SIDE = 2400;

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

  // Upload de imagen de plano: se comprime y se guarda en la base.
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No llegó la imagen del plano" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "Subí el plano como imagen (PNG, JPG o WebP). Si es PDF, exportá la página como imagen." },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "La imagen pesa más de 12 MB" }, { status: 400 });
    }

    let image: { data: Buffer; width: number; height: number };
    try {
      const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()), { animated: false })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({ width: PLAN_MAX_SIDE, height: PLAN_MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      image = { data, width: info.width, height: info.height };
    } catch (error) {
      console.error(`[room-builder/plan] imagen ilegible en ${params.id}`, error);
      return NextResponse.json({ ok: false, error: "No pudimos leer esa imagen. Probá con un PNG o JPG." }, { status: 400 });
    }

    const scene = parseScene(project.sceneJson);
    if (!scene) {
      return NextResponse.json({ ok: false, error: "Escena inválida" }, { status: 400 });
    }

    await prisma.roomPlanImage.upsert({
      where: { roomProjectId: params.id },
      create: { roomProjectId: params.id, data: image.data, mimeType: "image/webp", widthPx: image.width, heightPx: image.height },
      update: { data: image.data, mimeType: "image/webp", widthPx: image.width, heightPx: image.height },
    });
    const imageUrl = `/api/admin/room-builder/projects/${params.id}/plan-image?v=${Date.now()}`;

    const plan: PlanModeState = {
      enabled: true,
      imageUrl,
      metersPerPixel: 0.01,
      imageWidthPx: image.width,
      imageHeightPx: image.height,
      heightM: scene.heightM,
      walls: [],
      floorPolygon: rectangleFloor(scene.widthM, scene.depthM),
    };
    scene.plan = plan;
    await updateRoomProjectScene(params.id, scene);
    const fresh = await getRoomProject(params.id);
    return NextResponse.json({ ok: true, project: fresh, imageUrl, widthPx: image.width, heightPx: image.height });
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

  const imageUrl = scene.plan.imageUrl;
  // Reubica equipos y slots al tamaño real del plano.
  const resized = resizeSceneMeters(scene, { widthM: bounds.widthM, depthM: bounds.depthM, heightM });
  resized.plan = {
    enabled: true,
    imageUrl,
    metersPerPixel: mpp,
    imageWidthPx: parsed.data.imageWidthPx,
    imageHeightPx: parsed.data.imageHeightPx,
    heightM,
    walls,
    floorPolygon,
  };
  resized.areaM2 = bounds.areaM2;
  resized.cameraPreset = "plan";

  await updateRoomProjectScene(params.id, resized, {
    areaM2: bounds.areaM2,
    heightM,
  });

  await prisma.roomProject.update({
    where: { id: params.id },
    data: { areaM2: bounds.areaM2, heightM },
  });

  const fresh = await getRoomProject(params.id);
  return NextResponse.json({ ok: true, project: fresh, bounds });
}
