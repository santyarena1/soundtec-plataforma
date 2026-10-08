import type {
  CameraPreset,
  CoverageViewMode,
  DeviceCoverage,
  Pose,
  RoomSlot,
  RoomTemplate,
} from "./types";
import type { PlanModeState } from "./plan-mode";

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
};

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
