/** Tipos canónicos del Room Builder (sin dependencia de Prisma en runtime de tests). */

export const DESIGN_ROLES = [
  "camera",
  "mic",
  "display",
  "speaker",
  "touch",
  "codec",
  "processor",
  "furniture",
  "other",
] as const;
export type DesignRole = (typeof DESIGN_ROLES)[number];

export const ROOM_CATEGORIES = [
  "videoconference",
  "classroom",
  "training",
  "hotel",
  "event",
  "residential",
  "lobby",
  "control-room",
  "signage",
] as const;
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export const SIZE_PRESETS = ["S", "M", "L"] as const;
export type SizePreset = (typeof SIZE_PRESETS)[number];

export const PLATFORMS = ["teams", "zoom", "byod", "crestron-home", "none"] as const;
export type RoomPlatform = (typeof PLATFORMS)[number];

export const CAMERA_PRESETS = ["general", "front_av", "plan", "detail", "device_pov"] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

export const COVERAGE_VIEW_MODES = [
  "off",
  "zones",
  "seats",
  "selection",
] as const;
export type CoverageViewMode = (typeof COVERAGE_VIEW_MODES)[number];

export const MOUNT_OPTIONS = ["wall", "ceiling", "table", "rack", "floor"] as const;
export type MountOption = (typeof MOUNT_OPTIONS)[number];

export type CoverageSource = "datasheet" | "family_default" | "project_override" | "missing";

export type DeviceCoverage = {
  source: CoverageSource;
  hfovDeg?: number;
  vfovDeg?: number;
  maxRangeM?: number;
  micRadiusM?: number;
  micWidthM?: number;
  viewMinM?: number;
  viewMaxM?: number;
  coverageAngleDeg?: number;
};

export type Pose = {
  x: number;
  y: number;
  z: number;
  rotY: number;
};

export type RoomSlot = {
  key: string;
  role: DesignRole;
  label: string;
  required: boolean;
  mount: MountOption;
  pose: Pose;
  /** Cantidad sugerida al crear desde template */
  defaultQty: number;
};

export type RoomTemplate = {
  key: string;
  name: string;
  category: RoomCategory;
  sizePreset: SizePreset;
  areaM2: number;
  heightM: number;
  widthM: number;
  depthM: number;
  platforms: RoomPlatform[];
  slots: RoomSlot[];
  cameraPresets: CameraPreset[];
  description: string;
};

export type RankSortMode =
  | "recommended"
  | "price_asc"
  | "coverage"
  | "stock"
  | "premium";

export type RankCandidate = {
  productId: string;
  designRole: DesignRole | null;
  mountOptions: MountOption[];
  priceUsd: number | null;
  stockScore: number; // 0..1
  coverageFit: number | null; // 0..1, null = sin datos
  typologyFit: number; // 0..1
  dataCompleteness: number; // 0..1
  discontinued: boolean;
  brandBoost: number; // 0..1 extra comercial
};

export type RankResult = RankCandidate & {
  compatible: boolean;
  hardRejectReason?: string;
  score: number;
};