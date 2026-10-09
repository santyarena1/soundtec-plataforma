/**
 * Textos, opciones y valores por defecto del asistente de nuevo ambiente.
 * Sin React: así se puede testear y reusar.
 */

import type {
  AudioUse,
  BrandGroup,
  BriefControl,
  BriefSystem,
  BriefTier,
  BriefVcPlatform,
  RoomBrief,
  SpeakerStyle,
} from "@/services/room-builder/brief";

export type SectorKey = "residencial" | "hoteleria" | "corporativo" | "educacion" | "eventos" | "comercial";

export const SECTORS: Array<{ key: SectorKey; label: string; hint: string; categories: string[] }> = [
  { key: "residencial", label: "Residencial", hint: "Living, dormitorio, cine, comedor, exterior", categories: ["residential"] },
  { key: "hoteleria", label: "Hotelería", hint: "Habitaciones, suites, lobby, pileta", categories: ["hotel", "lobby"] },
  { key: "corporativo", label: "Corporativo", hint: "Salas de reunión, directorio, capacitación", categories: ["videoconference", "office", "training", "control-room", "common"] },
  { key: "educacion", label: "Educación", hint: "Aulas y salas de capacitación", categories: ["classroom", "training"] },
  { key: "eventos", label: "Eventos", hint: "Salones y auditorios", categories: ["event"] },
  { key: "comercial", label: "Comercial y gastronomía", hint: "Restaurantes, locales, recepciones, cartelería", categories: ["commercial", "lobby", "signage", "common"] },
];

export const SYSTEM_OPTIONS: Array<{ key: BriefSystem; label: string; hint: string }> = [
  { key: "audio", label: "Audio", hint: "Música funcional, ambiental o de alta fidelidad" },
  { key: "video", label: "Video", hint: "TV, pantallas o proyección" },
  { key: "vc", label: "Videoconferencia", hint: "Teams, Zoom o traer tu propia notebook" },
  { key: "control", label: "Control", hint: "Manejar todo desde un panel o el celular" },
  { key: "lighting", label: "Iluminación", hint: "Escenas y teclas de luces" },
  { key: "shades", label: "Cortinas", hint: "Cortinas y persianas motorizadas" },
  { key: "signage", label: "Cartelería digital", hint: "Menús, avisos y contenidos" },
];

export const CONTROL_OPTIONS: Array<{ key: BriefControl; label: string; hint: string }> = [
  { key: "crestron-home", label: "Crestron Home", hint: "Casas, suites y hoteles. Se configura sin programar y se maneja desde la app." },
  { key: "crestron-pro", label: "Crestron programado", hint: "Corporativo y proyectos a medida: procesador 4-Series con programación." },
  { key: "none", label: "Sin sistema de control", hint: "Cada equipo con su app o control. Ideal para proyectos solo de audio." },
];

export const VC_OPTIONS: Array<{ key: BriefVcPlatform; label: string; hint: string }> = [
  { key: "teams", label: "Microsoft Teams Rooms", hint: "La empresa usa Teams" },
  { key: "zoom", label: "Zoom Rooms", hint: "La empresa usa Zoom" },
  { key: "byod", label: "BYOD", hint: "Cada uno conecta su notebook (cualquier plataforma)" },
];

export const SPEAKER_STYLE_OPTIONS: Array<{ key: SpeakerStyle; label: string; hint: string }> = [
  { key: "ceiling", label: "De techo", hint: "Embutidos, discretos, cobertura pareja" },
  { key: "wall", label: "De pared", hint: "Embutidos o de superficie, mejor imagen estéreo" },
  { key: "invisible", label: "Invisibles", hint: "Se esconden bajo el yeso" },
  { key: "pendant", label: "Colgantes", hint: "Techos altos o sin cielorraso" },
  { key: "outdoor", label: "Exterior", hint: "Jardines, galerías, piletas" },
  { key: "column", label: "Columnas / de piso", hint: "Salones y alta potencia" },
];

export const AUDIO_USE_OPTIONS: Array<{ key: AudioUse; label: string; hint: string }> = [
  { key: "background", label: "Ambiental", hint: "Música de fondo a volumen bajo" },
  { key: "music", label: "Música", hint: "Escuchar música con buena calidad" },
  { key: "cinema", label: "Cine", hint: "Sonido envolvente con la TV" },
  { key: "voice", label: "Voz", hint: "Que se entienda bien a quien habla" },
];

export const TIER_OPTIONS: Array<{ key: BriefTier; label: string; hint: string }> = [
  { key: "esencial", label: "Esencial", hint: "Lo necesario al mejor precio" },
  { key: "recomendado", label: "Recomendado", hint: "Equilibrio entre calidad y precio" },
  { key: "premium", label: "Premium", hint: "Lo mejor de cada marca" },
];

export const BRAND_GROUP_LABELS: Record<BrandGroup, string> = {
  audio: "Parlantes",
  amplification: "Amplificación",
  video: "Pantallas",
  control: "Control",
  vc: "Videoconferencia",
  streaming: "Streaming",
};

export const DISPLAY_SIZES = [43, 55, 65, 75, 85, 98];

/** Sistemas típicos de cada tipo de ambiente (punto de partida editable). */
export function defaultSystemsFor(category: string, templateKey = ""): BriefSystem[] {
  if (templateKey === "residential-outdoor-m" || templateKey === "residential-dining-m") return ["audio", "control"];
  if (templateKey === "residential-cinema-m") return ["audio", "video", "control"];
  switch (category) {
    case "commercial":
      return ["audio", "video", "signage"];
    case "office":
      return templateKey === "office-private-m" || templateKey === "breakroom-m" ? ["audio", "video"] : ["audio"];
    case "common":
      return ["audio"];
    case "residential":
      return ["audio", "video", "control"];
    case "hotel":
      return ["audio", "video", "control"];
    case "videoconference":
      return ["vc", "video", "control"];
    case "classroom":
    case "training":
      return ["video", "audio"];
    case "event":
      return ["audio", "video"];
    case "lobby":
      return ["audio", "signage"];
    case "signage":
      return ["signage"];
    case "control-room":
      return ["video", "control"];
    default:
      return ["audio"];
  }
}

export function defaultControlFor(category: string): BriefControl {
  if (category === "residential" || category === "hotel") return "crestron-home";
  if (category === "videoconference" || category === "control-room" || category === "event") return "crestron-pro";
  return "none";
}

export function defaultSpeakerStyleFor(category: string, templateKey: string): SpeakerStyle {
  if (templateKey === "hotel-pool-bar-m" || templateKey === "hotel-common-m" || templateKey === "residential-outdoor-m") return "outdoor";
  if (templateKey === "residential-cinema-m") return "wall";
  if (category === "event") return "column";
  return "ceiling";
}

export function defaultAudioUseFor(category: string, templateKey = ""): AudioUse {
  if (templateKey === "residential-cinema-m") return "cinema";
  if (category === "commercial" || category === "office" || category === "common") return "background";
  if (category === "classroom" || category === "training" || category === "videoconference") return "voice";
  if (category === "lobby" || category === "hotel" || category === "signage") return "background";
  return "music";
}

/** Grupos de marca que tienen sentido según los sistemas elegidos. */
export function brandGroupsFor(systems: BriefSystem[], control: BriefControl): BrandGroup[] {
  const groups: BrandGroup[] = [];
  if (systems.includes("audio") || systems.includes("vc")) groups.push("audio", "amplification");
  if (systems.includes("video") || systems.includes("signage") || systems.includes("vc")) groups.push("video");
  if (systems.includes("vc")) groups.push("vc");
  if (systems.includes("control") && control !== "none") groups.push("control");
  return groups;
}

/** Respuestas iniciales para un ambiente. */
export function initialBrief(category: string, templateKey: string): RoomBrief {
  const systems = defaultSystemsFor(category, templateKey);
  return {
    version: 1,
    systems,
    control: systems.includes("control") ? defaultControlFor(category) : "none",
    vcPlatform: systems.includes("vc") ? "teams" : null,
    audio: {
      speakerStyle: defaultSpeakerStyleFor(category, templateKey),
      use: defaultAudioUseFor(category, templateKey),
      zones: 1,
      speakers: null,
      streaming: category === "residential" || category === "hotel" || category === "lobby" || category === "commercial",
    },
    video: { displays: 1, sizeIn: null },
    brands: {},
    tier: "recomendado",
    notes: null,
  };
}

export type WizardStep = "ambiente" | "sistemas" | "control" | "audio" | "video" | "marcas" | "espacio" | "resumen";

/** Pasos que aplican según lo elegido (se saltean los que no corresponden). */
export function stepsFor(brief: RoomBrief): WizardStep[] {
  const steps: WizardStep[] = ["ambiente", "sistemas"];
  if (brief.systems.includes("control") || brief.systems.includes("vc")) steps.push("control");
  if (brief.systems.includes("audio")) steps.push("audio");
  if (brief.systems.includes("video") || brief.systems.includes("vc")) steps.push("video");
  steps.push("marcas", "espacio", "resumen");
  return steps;
}

export const STEP_LABELS: Record<WizardStep, string> = {
  ambiente: "Ambiente",
  sistemas: "Sistemas",
  control: "Control",
  audio: "Audio",
  video: "Video",
  marcas: "Marcas",
  espacio: "Espacio y nivel",
  resumen: "Resumen",
};
