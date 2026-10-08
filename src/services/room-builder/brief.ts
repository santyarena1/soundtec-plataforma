/**
 * Relevamiento previo de un ambiente (asistente por pasos).
 *
 * Antes de generar la sala se pregunta qué sistemas lleva, con qué control,
 * cómo es el audio, qué marcas se prefieren y en qué nivel. Acá vive el
 * modelo de esas respuestas y cómo transforman los equipos de la plantilla.
 */

import type { Pose, RankSortMode, RoomPlatform, RoomSlot } from "./types";

export type RoomDims = { widthM: number; depthM: number; heightM: number };

const WALL_INSET_M = 0.08;
const RACK_Y_M = 0.45;

/**
 * Lugar por defecto de un equipo que la plantilla no trae, según dónde se
 * monta. La pared AV es la del frente (+z); el rack va al rincón del fondo.
 */
export function poseForMount(mount: RoomSlot["mount"], dims: RoomDims, role: string): Pose {
  const front = dims.depthM / 2 - WALL_INSET_M;
  const back = -dims.depthM / 2 + WALL_INSET_M;
  const left = -dims.widthM / 2 + WALL_INSET_M;
  switch (mount) {
    case "ceiling":
      return { x: 0, y: dims.heightM - 0.05, z: 0, rotY: 0 };
    case "wall":
      if (role === "speaker") return { x: left, y: Math.min(2.3, dims.heightM - 0.3), z: 0, rotY: 90 };
      if (role === "touch") return { x: left, y: 1.25, z: back + 0.6, rotY: 90 };
      return { x: 0, y: 1.4, z: front, rotY: 180 };
    case "floor":
      return { x: dims.widthM * 0.3, y: 0, z: front - 0.4, rotY: 180 };
    case "table":
      return { x: 0, y: 0.75, z: 0, rotY: 0 };
    case "rack":
    default:
      return { x: left + 0.4, y: RACK_Y_M, z: back + 0.4, rotY: 0 };
  }
}

export const BRIEF_SYSTEMS = ["audio", "video", "vc", "control", "lighting", "shades", "signage"] as const;
export type BriefSystem = (typeof BRIEF_SYSTEMS)[number];

export const BRIEF_CONTROLS = ["crestron-home", "crestron-pro", "none"] as const;
export type BriefControl = (typeof BRIEF_CONTROLS)[number];

export const BRIEF_VC_PLATFORMS = ["teams", "zoom", "byod"] as const;
export type BriefVcPlatform = (typeof BRIEF_VC_PLATFORMS)[number];

export const SPEAKER_STYLES = ["ceiling", "wall", "invisible", "outdoor", "pendant", "column"] as const;
export type SpeakerStyle = (typeof SPEAKER_STYLES)[number];

export const AUDIO_USES = ["background", "music", "cinema", "voice"] as const;
export type AudioUse = (typeof AUDIO_USES)[number];

export const BRIEF_TIERS = ["esencial", "recomendado", "premium"] as const;
export type BriefTier = (typeof BRIEF_TIERS)[number];

/** Categorías de marca que se pueden preferir. */
export const BRAND_GROUPS = ["audio", "amplification", "video", "control", "vc", "streaming"] as const;
export type BrandGroup = (typeof BRAND_GROUPS)[number];

export type RoomBrief = {
  version: 1;
  systems: BriefSystem[];
  control: BriefControl;
  vcPlatform: BriefVcPlatform | null;
  audio: {
    speakerStyle: SpeakerStyle;
    use: AudioUse;
    zones: number;
    /** null = que lo calcule el sistema según el tamaño. */
    speakers: number | null;
    streaming: boolean;
  } | null;
  video: { displays: number; sizeIn: number | null } | null;
  /** slugs de marca preferidos por grupo (vacío = sin preferencia). */
  brands: Partial<Record<BrandGroup, string[]>>;
  tier: BriefTier;
  notes: string | null;
};

export const MAX_SPEAKERS = 48;
export const MAX_ZONES = 24;
export const MAX_DISPLAYS = 12;

/** m² que cubre bien un parlante según el uso (techo, altura estándar). */
const M2_PER_SPEAKER: Record<AudioUse, number> = {
  background: 9,
  voice: 8,
  music: 6,
  cinema: 5,
};

/** Cantidad de parlantes sugerida: pares, al menos 2, más en usos exigentes. */
export function suggestSpeakerCount(areaM2: number, use: AudioUse, zones = 1): number {
  if (use === "cinema") return areaM2 > 30 ? 7 : 5;
  const byArea = Math.ceil(Math.max(areaM2, 1) / M2_PER_SPEAKER[use]);
  const perZone = Math.max(2, byArea);
  const total = Math.max(perZone, zones * 2);
  const even = total % 2 === 0 ? total : total + 1;
  return Math.min(MAX_SPEAKERS, even);
}

/** Plataforma del proyecto (campo existente) a partir de las respuestas. */
export function platformFromBrief(brief: RoomBrief): RoomPlatform {
  if (brief.systems.includes("vc") && brief.vcPlatform) return brief.vcPlatform;
  if (brief.control === "crestron-home") return "crestron-home";
  return "none";
}

/** Orden del ranking según el nivel elegido. */
export function rankModeForTier(tier: BriefTier): RankSortMode {
  if (tier === "esencial") return "price_asc";
  if (tier === "premium") return "premium";
  return "recommended";
}

/** Grupo de marca que aplica a un rol de equipo (null = sin preferencia posible). */
export function brandGroupForRole(role: string, slotKey = ""): BrandGroup | null {
  if (role === "speaker") return "audio";
  if (role === "display") return "video";
  if (role === "camera" || role === "mic" || role === "codec") return "vc";
  if (role === "touch") return "control";
  if (role === "processor") return /amp/i.test(slotKey) ? "amplification" : "control";
  return null;
}

const SPEAKER_MOUNT: Record<SpeakerStyle, RoomSlot["mount"]> = {
  ceiling: "ceiling",
  invisible: "ceiling",
  pendant: "ceiling",
  wall: "wall",
  outdoor: "wall",
  column: "floor",
};

const SPEAKER_LABEL: Record<SpeakerStyle, string> = {
  ceiling: "Parlantes de techo",
  invisible: "Parlantes invisibles",
  pendant: "Parlantes colgantes",
  wall: "Parlantes de pared",
  outdoor: "Parlantes de exterior",
  column: "Columnas / de piso",
};

const VC_ROLES = new Set(["camera", "mic", "codec"]);

function isControlSlot(slot: RoomSlot): boolean {
  return slot.role === "touch" || (slot.role === "processor" && !/amp/i.test(slot.key));
}

/**
 * Ajusta los equipos de la plantilla a lo relevado: saca lo que no va,
 * agrega lo que falta (parlantes, amplificador, control) y fija cantidades.
 * No calcula poses: eso lo hace el layout con las medidas reales.
 */
export function applyBriefToSlots(slots: RoomSlot[], brief: RoomBrief, dims: RoomDims): RoomSlot[] {
  const areaM2 = dims.widthM * dims.depthM;
  const has = (s: BriefSystem) => brief.systems.includes(s);
  const wantsControl = has("control") && brief.control !== "none";

  let next = slots.filter((slot) => {
    if (slot.role === "display") return has("video") || has("vc") || (has("signage") && /signage/.test(slot.key));
    if (VC_ROLES.has(slot.role)) return has("vc") || (slot.role === "mic" && brief.audio?.use === "voice");
    if (slot.role === "speaker") return has("audio") || has("vc");
    if (slot.key === "lighting_keypad") return wantsControl && has("lighting");
    if (isControlSlot(slot)) return wantsControl || (has("vc") && slot.role === "touch");
    return true;
  });

  next = next.map((slot) => {
    if (slot.role === "speaker" && brief.audio) {
      const qty = brief.audio.speakers ?? suggestSpeakerCount(areaM2, brief.audio.use, brief.audio.zones);
      const mount = SPEAKER_MOUNT[brief.audio.speakerStyle];
      return {
        ...slot,
        required: true,
        mount,
        pose: mount === slot.mount ? slot.pose : poseForMount(mount, dims, "speaker"),
        label: SPEAKER_LABEL[brief.audio.speakerStyle],
        defaultQty: Math.min(MAX_SPEAKERS, Math.max(1, qty)),
      };
    }
    if (slot.role === "display" && brief.video && !/signage/.test(slot.key)) {
      return { ...slot, required: true, defaultQty: Math.min(MAX_DISPLAYS, Math.max(1, brief.video.displays)) };
    }
    return slot;
  });

  if (has("audio") && brief.audio && !next.some((s) => s.role === "speaker")) {
    next.push({
      key: "speakers",
      role: "speaker",
      label: SPEAKER_LABEL[brief.audio.speakerStyle],
      required: true,
      mount: SPEAKER_MOUNT[brief.audio.speakerStyle],
      pose: poseForMount(SPEAKER_MOUNT[brief.audio.speakerStyle], dims, "speaker"),
      defaultQty: brief.audio.speakers ?? suggestSpeakerCount(areaM2, brief.audio.use, brief.audio.zones),
    });
  }

  if (has("audio") && brief.audio && !next.some((s) => s.key === "amplifier")) {
    next.push({
      key: "amplifier",
      role: "processor",
      label: "Amplificador",
      required: true,
      mount: "rack",
      pose: poseForMount("rack", dims, "processor"),
      defaultQty: 1,
    });
  }

  if (wantsControl && !next.some((s) => s.role === "processor" && !/amp/i.test(s.key))) {
    next.push({
      key: "processor",
      role: "processor",
      label: brief.control === "crestron-home" ? "Procesador Crestron Home" : "Procesador de control",
      required: true,
      mount: "rack",
      pose: { ...poseForMount("rack", dims, "processor"), x: poseForMount("rack", dims, "processor").x + 0.6 },
      defaultQty: 1,
    });
  }

  if (wantsControl && !next.some((s) => s.role === "touch")) {
    next.push({
      key: "touch",
      role: "touch",
      label: "Panel táctil",
      required: false,
      mount: "wall",
      pose: poseForMount("wall", dims, "touch"),
      defaultQty: 1,
    });
  }

  if (wantsControl && has("lighting") && !next.some((s) => s.key === "lighting_keypad")) {
    next.push({
      key: "lighting_keypad",
      role: "touch",
      label: "Teclas de iluminación",
      required: true,
      mount: "wall",
      pose: { ...poseForMount("wall", dims, "touch"), z: poseForMount("wall", dims, "touch").z + 0.5 },
      defaultQty: 1,
    });
  }

  return next;
}

/** Valida y normaliza respuestas que vienen del cliente o de la base. */
export function normalizeBrief(raw: unknown): RoomBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
    list.includes(v as T) ? (v as T) : fallback;
  const int = (v: unknown, lo: number, hi: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };

  const systems = Array.isArray(r.systems)
    ? [...new Set(r.systems.filter((s): s is BriefSystem => BRIEF_SYSTEMS.includes(s as BriefSystem)))]
    : [];
  if (!systems.length) return null;

  const audioRaw = r.audio && typeof r.audio === "object" ? (r.audio as Record<string, unknown>) : null;
  const videoRaw = r.video && typeof r.video === "object" ? (r.video as Record<string, unknown>) : null;
  const brandsRaw = r.brands && typeof r.brands === "object" ? (r.brands as Record<string, unknown>) : {};
  const brands: RoomBrief["brands"] = {};
  for (const g of BRAND_GROUPS) {
    const list = brandsRaw[g];
    if (Array.isArray(list)) {
      const slugs = list.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,60}$/.test(s)).slice(0, 12);
      if (slugs.length) brands[g] = slugs;
    }
  }

  return {
    version: 1,
    systems,
    control: pick(r.control, BRIEF_CONTROLS, "none"),
    vcPlatform: systems.includes("vc") ? pick(r.vcPlatform, BRIEF_VC_PLATFORMS, "teams") : null,
    audio:
      systems.includes("audio") && audioRaw
        ? {
            speakerStyle: pick(audioRaw.speakerStyle, SPEAKER_STYLES, "ceiling"),
            use: pick(audioRaw.use, AUDIO_USES, "music"),
            zones: int(audioRaw.zones, 1, MAX_ZONES, 1),
            speakers: audioRaw.speakers == null || audioRaw.speakers === "" ? null : int(audioRaw.speakers, 1, MAX_SPEAKERS, 2),
            streaming: Boolean(audioRaw.streaming),
          }
        : null,
    video:
      (systems.includes("video") || systems.includes("vc")) && videoRaw
        ? {
            displays: int(videoRaw.displays, 1, MAX_DISPLAYS, 1),
            sizeIn: videoRaw.sizeIn == null || videoRaw.sizeIn === "" ? null : int(videoRaw.sizeIn, 24, 220, 65),
          }
        : null,
    brands,
    tier: pick(r.tier, BRIEF_TIERS, "recomendado"),
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim().slice(0, 1000) : null,
  };
}

/** Marcas preferidas que aplican a un equipo (vacío = sin preferencia). */
export function preferredBrandsForSlot(brief: RoomBrief | null | undefined, role: string, slotKey: string): string[] {
  if (!brief) return [];
  const group = brandGroupForRole(role, slotKey);
  return group ? (brief.brands[group] ?? []) : [];
}
