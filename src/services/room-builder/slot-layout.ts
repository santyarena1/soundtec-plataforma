import type { Pose, RoomSlot } from "./types";
import type { RoomScene } from "./scene";
import { applyBriefToSlots, type RoomBrief, type RoomDims } from "./brief";
import { layoutExtraSlots } from "./slot-layout-extra";

type Dims = { widthM: number; depthM: number; heightM: number };

function r(n: number) {
  return Math.round(n * 100) / 100;
}

function pose(
  x: number,
  y: number,
  z: number,
  rotY = 0,
): Pose {
  return { x: r(x), y: r(y), z: r(z), rotY };
}

function slot(
  partial: Omit<RoomSlot, "pose"> & { pose: Pose },
): RoomSlot {
  return partial;
}

/** Anclas de sala (paredes / techo) compartidas con el mobiliario 3D. */
export function roomAnchors(d: Dims) {
  const wall = 0.08;
  return {
    frontZ: d.depthM / 2 - wall,
    backZ: -d.depthM / 2 + wall,
    leftX: -d.widthM / 2 + wall,
    rightX: d.widthM / 2 - wall,
    ceilY: d.heightM - 0.05,
    midY: d.heightM * 0.5,
  };
}

export function hotelGuestAnchors(d: Dims) {
  const a = roomAnchors(d);
  const bedW = Math.min(d.widthM * 0.55, 1.8);
  const bedD = Math.min(d.depthM * 0.42, 2.1);
  const bedZ = -d.depthM * 0.12;
  return {
    ...a,
    bedW,
    bedD,
    bedZ,
    nightstandX: bedW / 2 + 0.35,
    nightstandZ: -d.depthM * 0.05,
    nightstandTopY: 0.54,
    // Escritorio contra la pared del fondo, en el rincón, con paso desde la mesa de luz.
    deskW: 0.9,
    deskX: d.widthM / 2 - 0.47,
    deskZ: -d.depthM / 2 + 0.27,
    deskTopY: 0.76,
    wardrobeX: -d.widthM / 2 + 0.35,
    wardrobeZ: -d.depthM / 2 + 0.5,
    tvY: 1.35,
  };
}

export function layoutSlotsForTemplate(
  templateKey: string,
  widthM: number,
  depthM: number,
  heightM: number,
): RoomSlot[] {
  const d = { widthM, depthM, heightM };
  const a = roomAnchors(d);

  if (templateKey.includes("huddle") || templateKey.startsWith("vc-")) {
    const size = templateKey.includes("huddle")
      ? "S"
      : templateKey.includes("boardroom-l") || templateKey.endsWith("-l")
        ? "L"
        : "M";
    const tableW = size === "S" ? 1.6 : size === "M" ? 2.6 : 3.8;
    return [
      slot({
        key: "display_main",
        role: "display",
        label: "Display principal",
        required: true,
        mount: "wall",
        pose: pose(0, 1.4, a.frontZ, 180),
        defaultQty: size === "L" ? 2 : 1,
      }),
      slot({
        key: "camera_main",
        role: "camera",
        label: "Cámara",
        required: true,
        mount: "wall",
        pose: pose(0, 1.85, a.frontZ - 0.02, 180),
        defaultQty: 1,
      }),
      slot({
        key: "mic_ceiling",
        role: "mic",
        label: "Micrófono",
        required: true,
        mount: "ceiling",
        pose: pose(0, a.ceilY, 0, 0),
        defaultQty: size === "L" ? 2 : 1,
      }),
      slot({
        key: "touch_table",
        role: "touch",
        label: "Touch de control",
        required: size !== "S",
        mount: "table",
        pose: pose(tableW / 2 - 0.2, 0.76, 0.05, -15),
        defaultQty: 1,
      }),
      slot({
        key: "codec",
        role: "codec",
        label: "Codec / compute",
        required: true,
        mount: "rack",
        pose: pose(a.leftX + 0.35, 0.45, a.backZ + 0.35, 0),
        defaultQty: 1,
      }),
      slot({
        key: "speaker",
        role: "speaker",
        label: "Audio",
        required: false,
        mount: "wall",
        pose: pose(0, 0.95, a.frontZ - 0.02, 180),
        defaultQty: 1,
      }),
      slot({
        key: "lighting_keypad",
        role: "touch",
        label: "Tecla iluminación / control",
        required: false,
        mount: "wall",
        pose: pose(a.rightX, 1.15, a.backZ + 0.7, -90),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "classroom-m") {
    return [
      slot({
        key: "display_front",
        role: "display",
        label: "Display / proyector",
        required: true,
        mount: "wall",
        pose: pose(0, 1.55, a.frontZ, 180),
        defaultQty: 1,
      }),
      slot({
        key: "camera_front",
        role: "camera",
        label: "Cámara frontal",
        required: true,
        mount: "wall",
        pose: pose(0.55, 2.05, a.frontZ - 0.02, 180),
        defaultQty: 1,
      }),
      slot({
        key: "mic_zone",
        role: "mic",
        label: "Micrófono de zona",
        required: true,
        mount: "ceiling",
        pose: pose(0, a.ceilY, -depthM * 0.05, 0),
        defaultQty: 2,
      }),
      slot({
        key: "speakers",
        role: "speaker",
        label: "Parlantes",
        required: true,
        mount: "ceiling",
        pose: pose(0, a.ceilY, depthM * 0.15, 0),
        defaultQty: 4,
      }),
    ];
  }

  if (templateKey === "training-l") {
    return [
      slot({
        key: "display_main",
        role: "display",
        label: "Display principal",
        required: true,
        mount: "wall",
        pose: pose(-0.9, 1.5, a.frontZ, 180),
        defaultQty: 2,
      }),
      slot({
        key: "camera_main",
        role: "camera",
        label: "Cámara",
        required: true,
        mount: "wall",
        pose: pose(0, 1.95, a.frontZ - 0.02, 180),
        defaultQty: 1,
      }),
      slot({
        key: "mic_ceiling",
        role: "mic",
        label: "Mic techo",
        required: true,
        mount: "ceiling",
        pose: pose(0, a.ceilY, 0, 0),
        defaultQty: 3,
      }),
      slot({
        key: "touch",
        role: "touch",
        label: "Touch",
        required: false,
        mount: "table",
        pose: pose(0.4, 0.76, depthM * 0.05, 0),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "hotel-guest-s") {
    const g = hotelGuestAnchors(d);
    return [
      slot({
        key: "tv",
        role: "display",
        label: "TV",
        required: true,
        mount: "wall",
        pose: pose(0, g.tvY, g.frontZ, 180),
        defaultQty: 1,
      }),
      slot({
        key: "touch",
        role: "touch",
        label: "Control / touch",
        required: true,
        mount: "table",
        pose: pose(g.nightstandX, g.nightstandTopY, g.nightstandZ, -25),
        defaultQty: 1,
      }),
      slot({
        key: "lighting_keypad",
        role: "touch",
        label: "Tecla iluminación Crestron",
        required: false,
        mount: "wall",
        pose: pose(g.leftX, 1.15, g.bedZ + 0.35, 90),
        defaultQty: 1,
      }),
      slot({
        key: "processor",
        role: "processor",
        label: "Procesador Crestron Home",
        required: true,
        mount: "rack",
        pose: pose(g.wardrobeX, 0.45, g.wardrobeZ, 0),
        defaultQty: 1,
      }),
      slot({
        key: "speakers",
        role: "speaker",
        label: "Audio",
        required: false,
        mount: "ceiling",
        pose: pose(0, g.ceilY, g.bedZ, 0),
        defaultQty: 2,
      }),
    ];
  }

  if (templateKey === "hotel-suite-m") {
    return [
      slot({
        key: "tv_living",
        role: "display",
        label: "TV living",
        required: true,
        mount: "wall",
        pose: pose(0, 1.4, a.frontZ, 180),
        defaultQty: 1,
      }),
      slot({
        key: "processor",
        role: "processor",
        label: "Procesador / control",
        required: true,
        mount: "rack",
        pose: pose(a.leftX + 0.4, 0.45, a.backZ + 0.45, 0),
        defaultQty: 1,
      }),
      slot({
        key: "speakers",
        role: "speaker",
        label: "Audio",
        required: true,
        mount: "ceiling",
        pose: pose(0, a.ceilY, depthM * 0.12, 0),
        defaultQty: 4,
      }),
      slot({
        key: "touch",
        role: "touch",
        label: "Touch",
        required: true,
        mount: "table",
        pose: pose(-widthM * 0.1, 0.42, depthM * 0.32, 0),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "hotel-pool-bar-m") {
    return [
      slot({
        key: "speakers_outdoor",
        role: "speaker",
        label: "Audio exterior",
        required: true,
        mount: "wall",
        pose: pose(a.leftX, 2.3, depthM * 0.1, 90),
        defaultQty: 4,
      }),
      slot({
        key: "signage",
        role: "display",
        label: "Signage / menú",
        required: false,
        mount: "wall",
        pose: pose(0, 1.55, a.frontZ, 180),
        defaultQty: 1,
      }),
      slot({
        key: "processor",
        role: "processor",
        label: "Control / DSP",
        required: true,
        mount: "rack",
        pose: pose(a.leftX + 0.4, 0.45, a.backZ + 0.4, 0),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "hotel-common-m") {
    return [
      slot({
        key: "speakers_zone",
        role: "speaker",
        label: "Audio de zona",
        required: true,
        mount: "ceiling",
        pose: pose(0, a.ceilY, 0, 0),
        defaultQty: 6,
      }),
      slot({
        key: "signage",
        role: "display",
        label: "Signage",
        required: false,
        mount: "wall",
        pose: pose(0, 1.55, a.frontZ, 180),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "event-banquet-l") {
    const stageZ = depthM / 2 - Math.min(depthM * 0.22, 2.2) / 2 - 0.1;
    return [
      slot({
        key: "display_stage",
        role: "display",
        label: "Display escenario",
        required: true,
        mount: "wall",
        pose: pose(0, 2.1, a.frontZ, 180),
        defaultQty: 2,
      }),
      slot({
        key: "speakers_pa",
        role: "speaker",
        label: "PA",
        required: true,
        mount: "floor",
        pose: pose(-widthM * 0.35, 1.2, stageZ - 0.4, 160),
        defaultQty: 4,
      }),
      slot({
        key: "mic_wireless",
        role: "mic",
        label: "Mic inalámbrico",
        required: true,
        mount: "table",
        pose: pose(0, 1.05, stageZ, 0),
        defaultQty: 2,
      }),
      slot({
        key: "processor",
        role: "processor",
        label: "Procesador / DSP",
        required: true,
        mount: "rack",
        pose: pose(a.leftX + 0.45, 0.5, a.backZ + 0.45, 0),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "residential-living-m") {
    return [
      slot({
        key: "tv",
        role: "display",
        label: "TV / proyector",
        required: true,
        mount: "wall",
        pose: pose(0, 1.35, a.frontZ, 180),
        defaultQty: 1,
      }),
      slot({
        key: "processor",
        role: "processor",
        label: "Procesador Home",
        required: true,
        mount: "rack",
        pose: pose(a.leftX + 0.4, 0.45, a.backZ + 0.4, 0),
        defaultQty: 1,
      }),
      slot({
        key: "speakers",
        role: "speaker",
        label: "Audio",
        required: true,
        mount: "ceiling",
        pose: pose(0, a.ceilY, 0, 0),
        defaultQty: 4,
      }),
      slot({
        key: "touch",
        role: "touch",
        label: "Touchpanel",
        required: true,
        mount: "wall",
        pose: pose(a.rightX, 1.25, depthM * 0.15, -90),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "lobby-m") {
    return [
      slot({
        key: "signage",
        role: "display",
        label: "Signage",
        required: true,
        mount: "wall",
        pose: pose(widthM * 0.35, 1.5, depthM * 0.05, -20),
        defaultQty: 1,
      }),
      slot({
        key: "speakers",
        role: "speaker",
        label: "Audio ambiente",
        required: false,
        mount: "ceiling",
        pose: pose(0, a.ceilY, 0, 0),
        defaultQty: 2,
      }),
    ];
  }

  if (templateKey === "control-room-m") {
    return [
      slot({
        key: "displays",
        role: "display",
        label: "Monitores",
        required: true,
        mount: "wall",
        pose: pose(0, 1.5, a.frontZ, 180),
        defaultQty: 2,
      }),
      slot({
        key: "processor",
        role: "processor",
        label: "Procesador",
        required: true,
        mount: "rack",
        pose: pose(a.leftX + 0.4, 0.9, a.backZ + 0.5, 0),
        defaultQty: 1,
      }),
    ];
  }

  if (templateKey === "signage-corridor-s") {
    return [
      slot({
        key: "display",
        role: "display",
        label: "Display",
        required: true,
        mount: "wall",
        pose: pose(a.leftX, 1.5, 0, 90),
        defaultQty: 1,
      }),
    ];
  }

  const extra = layoutExtraSlots(templateKey, d);
  if (extra) return extra;

  // fallback: display en pared frontal
  return [
    slot({
      key: "display_main",
      role: "display",
      label: "Display",
      required: true,
      mount: "wall",
      pose: pose(0, 1.4, a.frontZ, 180),
      defaultQty: 1,
    }),
  ];
}

function poseChanged(a: Pose, b: Pose) {
  return (
    Math.abs(a.x - b.x) > 0.02 ||
    Math.abs(a.y - b.y) > 0.02 ||
    Math.abs(a.z - b.z) > 0.02 ||
    Math.abs(a.rotY - b.rotY) > 1
  );
}

/**
 * Reubica slots/dispositivos según anclas del template y metros actuales.
 * Corrige proyectos viejos con poses hardcodeadas que flotaban en el aire.
 */
function poseInsideRoom(pose: { x: number; y: number; z: number }, scene: RoomScene) {
  if (![pose.x, pose.y, pose.z].every((n) => Number.isFinite(n))) return false;
  const margin = 1.2;
  return (
    Math.abs(pose.x) <= scene.widthM / 2 + margin &&
    Math.abs(pose.z) <= scene.depthM / 2 + margin &&
    pose.y >= -0.4 &&
    pose.y <= scene.heightM + 0.5
  );
}

/** Equipos de la plantilla para estas medidas, ajustados al relevamiento si lo hay. */
export function layoutSlotsForScene(templateKey: string, dims: RoomDims, brief: RoomBrief | null): RoomSlot[] {
  const base = layoutSlotsForTemplate(templateKey, dims.widthM, dims.depthM, dims.heightM);
  return brief ? applyBriefToSlots(base, brief, dims) : base;
}

export function relayoutSceneAnchors(
  scene: RoomScene,
  opts?: { onlyInvalid?: boolean },
): {
  scene: RoomScene;
  changed: boolean;
} {
  if (!scene.templateKey) return { scene, changed: false };
  const nextSlots = layoutSlotsForScene(scene.templateKey, scene, scene.brief ?? null);
  const byKey = new Map(nextSlots.map((s) => [s.key, s]));
  let changed = false;

  const slots = scene.slots.map((s) => {
    const layout = byKey.get(s.key);
    if (!layout) return s;
    const keep =
      opts?.onlyInvalid && poseInsideRoom(s.pose, scene) && s.mount === layout.mount;
    if (keep) return s;
    if (poseChanged(s.pose, layout.pose) || s.mount !== layout.mount) {
      changed = true;
      return { ...s, pose: { ...layout.pose }, mount: layout.mount };
    }
    return s;
  });

  // slots nuevos del template que faltan en la escena
  for (const layout of nextSlots) {
    if (!slots.some((s) => s.key === layout.key)) {
      slots.push(layout);
      changed = true;
    }
  }

  const devices = scene.devices.map((d) => {
    const layout = byKey.get(d.slotKey);
    if (!layout) return d;
    if (opts?.onlyInvalid && poseInsideRoom(d.pose, scene)) return d;
    if (poseChanged(d.pose, layout.pose)) {
      changed = true;
      return { ...d, pose: { ...layout.pose } };
    }
    return d;
  });

  if (!changed) return { scene, changed: false };
  return {
    scene: { ...scene, slots, devices },
    changed: true,
  };
}
