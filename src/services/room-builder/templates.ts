import type { CameraPreset, RoomPlatform, RoomTemplate, SizePreset } from "./types";
import { layoutSlotsForTemplate } from "./slot-layout";

const DEFAULT_CAMERAS: CameraPreset[] = [
  "general",
  "eye",
  "cinema",
  "front_av",
  "plan",
  "detail",
];

function dimsFor(areaM2: number, ratio = 1.4): { widthM: number; depthM: number } {
  const depthM = Math.sqrt(areaM2 / ratio);
  const widthM = areaM2 / depthM;
  return {
    widthM: Math.round(widthM * 100) / 100,
    depthM: Math.round(depthM * 100) / 100,
  };
}

const UC: RoomPlatform[] = ["teams", "zoom", "byod"];

function vcTemplate(
  size: SizePreset,
  areaM2: number,
  name: string,
  key: string,
): RoomTemplate {
  const { widthM, depthM } = dimsFor(areaM2);
  const heightM = 2.7;
  return {
    key,
    name,
    category: "videoconference",
    sizePreset: size,
    areaM2,
    heightM,
    widthM,
    depthM,
    platforms: UC,
    slots: layoutSlotsForTemplate(key, widthM, depthM, heightM),
    cameraPresets: [...DEFAULT_CAMERAS, "device_pov"],
    description: `Sala de videoconferencia ${size} (~${areaM2} m²).`,
  };
}

function tpl(
  partial: Omit<RoomTemplate, "slots" | "widthM" | "depthM"> & {
    areaM2: number;
    ratio?: number;
  },
): RoomTemplate {
  const { widthM, depthM } = dimsFor(partial.areaM2, partial.ratio ?? 1.4);
  const { ratio: _r, ...rest } = partial;
  return {
    ...rest,
    widthM,
    depthM,
    slots: layoutSlotsForTemplate(
      partial.key,
      widthM,
      depthM,
      partial.heightM,
    ),
  };
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  vcTemplate("S", 10, "Huddle / Phone room", "vc-huddle-s"),
  vcTemplate("M", 18, "Sala de reuniones", "vc-meeting-m"),
  vcTemplate("L", 28, "Boardroom", "vc-boardroom-l"),
  vcTemplate("M", 22, "Sala de directorio mediana", "vc-boardroom-m"),

  tpl({
    key: "classroom-m",
    name: "Aula / Classroom",
    category: "classroom",
    sizePreset: "M",
    areaM2: 45,
    heightM: 2.8,
    ratio: 1.2,
    platforms: ["teams", "zoom", "byod"],
    cameraPresets: DEFAULT_CAMERAS,
    description: "Aula con display frontal, cámara y audio de zona.",
  }),
  tpl({
    key: "training-l",
    name: "Sala de capacitación",
    category: "training",
    sizePreset: "L",
    areaM2: 60,
    heightM: 2.9,
    ratio: 1.3,
    platforms: ["teams", "zoom", "byod"],
    cameraPresets: DEFAULT_CAMERAS,
    description: "Capacitación con doble display y cobertura de mic amplia.",
  }),
  tpl({
    key: "hotel-guest-s",
    name: "Habitación de hotel",
    category: "hotel",
    sizePreset: "S",
    areaM2: 22,
    heightM: 2.6,
    ratio: 1.5,
    platforms: ["crestron-home", "none"],
    cameraPresets: ["general", "eye", "cinema", "plan", "detail"],
    description: "Guest room con TV y control.",
  }),
  tpl({
    key: "hotel-suite-m",
    name: "Suite de hotel",
    category: "hotel",
    sizePreset: "M",
    areaM2: 40,
    heightM: 2.7,
    platforms: ["crestron-home", "none"],
    cameraPresets: ["general", "eye", "cinema", "plan", "detail"],
    description: "Suite con living AV y control.",
  }),
  tpl({
    key: "event-banquet-l",
    name: "Salón de eventos",
    category: "event",
    sizePreset: "L",
    areaM2: 120,
    heightM: 4,
    ratio: 1.6,
    platforms: ["none", "byod"],
    cameraPresets: ["general", "front_av", "plan", "detail"],
    description: "Salón con PA, displays y mics (BOM-first).",
  }),
  tpl({
    key: "residential-living-m",
    name: "Living / media room",
    category: "residential",
    sizePreset: "M",
    areaM2: 35,
    heightM: 2.7,
    ratio: 1.35,
    platforms: ["crestron-home"],
    cameraPresets: ["general", "eye", "cinema", "plan", "detail"],
    description: "Living residencial Crestron Home.",
  }),
  tpl({
    key: "lobby-m",
    name: "Lobby / recepción",
    category: "lobby",
    sizePreset: "M",
    areaM2: 30,
    heightM: 3,
    ratio: 1.1,
    platforms: ["none", "byod"],
    cameraPresets: ["general", "eye", "plan", "detail"],
    description: "Lobby con digital signage.",
  }),
  tpl({
    key: "hotel-pool-bar-m",
    name: "Bar de pileta",
    category: "hotel",
    sizePreset: "M",
    areaM2: 50,
    heightM: 3.2,
    ratio: 1.3,
    platforms: ["crestron-home", "none"],
    cameraPresets: ["general", "eye", "plan", "detail"],
    description: "Espacio común pileta/bar con audio outdoor y signage.",
  }),
  tpl({
    key: "hotel-common-m",
    name: "Espacio común / parque",
    category: "hotel",
    sizePreset: "M",
    areaM2: 80,
    heightM: 3,
    ratio: 1.2,
    platforms: ["none", "crestron-home"],
    cameraPresets: ["general", "plan", "detail"],
    description: "Área común o parque con audio de zona y cartelería.",
  }),
  tpl({
    key: "control-room-m",
    name: "Sala técnica / control",
    category: "control-room",
    sizePreset: "M",
    areaM2: 20,
    heightM: 2.7,
    ratio: 1.5,
    platforms: ["none"],
    cameraPresets: ["general", "plan", "detail"],
    description: "Sala técnica orientada a BOM de rack.",
  }),
  tpl({
    key: "signage-corridor-s",
    name: "Pasillo / digital signage",
    category: "signage",
    sizePreset: "S",
    areaM2: 8,
    heightM: 2.7,
    ratio: 2,
    platforms: ["none"],
    cameraPresets: ["general", "detail"],
    description: "Punto de cartelería digital.",
  }),
];

export function listRoomTemplates(): RoomTemplate[] {
  return ROOM_TEMPLATES;
}

export function getRoomTemplate(key: string): RoomTemplate | undefined {
  return ROOM_TEMPLATES.find((t) => t.key === key);
}

export function listTemplatesByCategory(category: string): RoomTemplate[] {
  return ROOM_TEMPLATES.filter((t) => t.category === category);
}

export function resizeTemplate(template: RoomTemplate, areaM2: number): RoomTemplate {
  const safeArea = Math.max(4, areaM2);
  const ratio = template.widthM / Math.max(template.depthM, 0.01);
  const depthM = Math.sqrt(safeArea / ratio);
  const widthM = safeArea / depthM;
  const w = Math.round(widthM * 100) / 100;
  const d = Math.round(depthM * 100) / 100;
  return {
    ...template,
    areaM2: Math.round(safeArea * 100) / 100,
    widthM: w,
    depthM: d,
    slots: layoutSlotsForTemplate(template.key, w, d, template.heightM),
  };
}
