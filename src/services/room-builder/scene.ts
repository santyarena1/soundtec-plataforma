import type { SceneWiring } from "./wiring/types";
import type { GenericInfo } from "./generic/library";
import type {
  CameraPreset,
  CoverageViewMode,
  DeviceCoverage,
  Pose,
  RoomSlot,
  RoomTemplate,
} from "./types";
import type { PlanModeState } from "./plan-mode";
import type { RoomBrief } from "./brief";
import type { DeviceUnit } from "./units";
import type { FurnitureItem, FurnitureOverrides } from "./furnishing";

export type SceneDevice = {
  id: string;
  slotKey: string;
  productId: string | null;
  designRole: string;
  label: string;
  quantity: number;
  pose: Pose;
  coverage: DeviceCoverage | null;
  productName?: string | null;
  brandName?: string | null;
  imageUrl?: string | null;
  proxyKey?: string | null;
  /** Unidades físicas (tantas como quantity), cada una con su lugar. */
  units?: DeviceUnit[];
  /** Medidas reales del producto (cm), para dibujarlo a escala. */
  sizeCm?: ProductSizeCm | null;
  /** Equipo genérico (no es del catálogo): plantilla, nombre, precio y descripción a completar. */
  generic?: GenericInfo | null;
};

export type ProductSizeCm = { w: number | null; h: number | null; d: number | null };

/** Decimal/num de Prisma → cm positivos o null. */
export function productSizeCm(p: { widthCm?: unknown; heightCm?: unknown; depthCm?: unknown } | null | undefined): ProductSizeCm | null {
  if (!p) return null;
  const num = (v: unknown) => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const size = { w: num(p.widthCm), h: num(p.heightCm), d: num(p.depthCm) };
  return size.w || size.h || size.d ? size : null;
}

export type RoomScene = {
  version: 1;
  templateKey: string;
  widthM: number;
  depthM: number;
  heightM: number;
  areaM2: number;
  cameraPreset: CameraPreset;
  coverageView: CoverageViewMode;
  selectedSlotKey: string | null;
  slots: RoomSlot[];
  devices: SceneDevice[];
  /** Presente cuando el espacio se armó / editó desde plano. */
  plan?: PlanModeState | null;
  /** Relevamiento del asistente: define qué equipos lleva la sala y con qué marcas. */
  brief?: RoomBrief | null;
  /** Muebles quitados o movidos por el usuario (sobre el amoblamiento de la tipología). */
  furniture?: FurnitureOverrides | null;
  /** El plano original debajo de la sala (ambientes creados desde un plano). */
  planUnderlay?: PlanUnderlay | null;
  /** Muebles reconocidos en el plano (reemplazan al amoblamiento de la tipología). */
  planFurniture?: FurnitureItem[] | null;
  /** Plano técnico: cables de puerto a puerto, con recorrido, tipo y etiqueta (editables a mano). */
  wiring?: SceneWiring | null;
};

/**
 * Cómo calza el plano en el piso de la sala: el centro de la sala (0,0) cae en
 * `centerPx` de la imagen; X a la derecha y Z hacia abajo del plano.
 */
export type PlanUnderlay = {
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  centerPx: { x: number; y: number };
  /** Metros por píxel en cada eje. */
  mppX: number;
  mppZ: number;
};

export function buildSceneFromTemplate(template: RoomTemplate): RoomScene {
  return {
    version: 1,
    templateKey: template.key,
    widthM: template.widthM,
    depthM: template.depthM,
    heightM: template.heightM,
    areaM2: template.areaM2,
    cameraPreset: "general",
    coverageView: "zones",
    selectedSlotKey: template.slots[0]?.key ?? null,
    slots: template.slots,
    devices: template.slots.map((slot) => ({
      id: `slot-${slot.key}`,
      slotKey: slot.key,
      productId: null,
      designRole: slot.role,
      label: slot.label,
      quantity: slot.defaultQty,
      pose: { ...slot.pose },
      coverage: null,
      productName: null,
      brandName: null,
    })),
  };
}

export function parseScene(raw: unknown): RoomScene | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<RoomScene>;
  if (s.version !== 1 || !Array.isArray(s.slots) || !Array.isArray(s.devices)) {
    return null;
  }
  return s as RoomScene;
}
