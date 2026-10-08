/**
 * Construye un borrador de ProductDesignProfile SOLO con datos ya en plataforma.
 * No llama Serper ni OpenAI ni scrapea sitios. Sirve como base offline / pre-enrich.
 */

import { viewingDistanceFromDiagonalIn } from "./coverage";
import type { DesignRole, MountOption } from "./types";

export type SpecPair = { label: string; value: string; group?: string };

export type ProductDesignSource = {
  id: string;
  normalizedName: string;
  modelNumber?: string | null;
  manufacturerItem?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
  weight?: number | null;
  isDiscontinued?: boolean;
  isCrestronHomeCompatible?: boolean;
  vendorProductUrl?: string | null;
  specifications?: unknown;
  keyFeatures?: unknown;
  aiProductType?: string | null;
  aiMountTypes?: string[];
  aiApplications?: string[];
  categoryName?: string | null;
  familyName?: string | null;
};

export type DesignProfileDraft = {
  productId: string;
  designRole: DesignRole | null;
  roomCategories: string[];
  mountOptions: MountOption[];
  defaultMountHeightM: number | null;
  widthM: number | null;
  heightM: number | null;
  depthM: number | null;
  weightKg: number | null;
  hfovDeg: number | null;
  vfovDeg: number | null;
  maxRangeM: number | null;
  micPattern: string | null;
  coverageRadiusM: number | null;
  diagonalIn: number | null;
  viewingDistanceMinM: number | null;
  viewingDistanceMaxM: number | null;
  proxyKey: string | null;
  completenessScore: number;
  confidenceScore: number;
  status: "pending" | "auto" | "needs_review";
  fieldEvidence: Record<string, { source: string; note: string }>;
  officialUrl: string | null;
};

const TYPE_TO_ROLE: Record<string, DesignRole> = {
  camera: "camera",
  microphone: "mic",
  display: "display",
  speaker: "speaker",
  subwoofer: "speaker",
  touchpanel: "touch",
  processor: "processor",
  control: "processor",
  amplifier: "processor",
  switcher: "processor",
  network: "other",
  mount: "other",
  cable: "other",
  lighting: "other",
  power: "other",
  accessory: "other",
  other: "other",
};

const AI_MOUNT_TO_OPTION: Record<string, MountOption> = {
  "in-ceiling": "ceiling",
  "in-wall": "wall",
  "on-wall": "wall",
  surface: "wall",
  pendant: "ceiling",
  rack: "rack",
  landscape: "floor",
  pole: "floor",
  desktop: "table",
  portable: "table",
  flush: "wall",
};

function parseSpecs(value: unknown): SpecPair[] {
  if (!Array.isArray(value)) return [];
  const out: SpecPair[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const label = String(row.labelEs ?? row.label ?? row.name ?? "").trim();
    const val = String(row.valueEs ?? row.value ?? "").trim();
    if (label && val) out.push({ label, value: val, group: String(row.group ?? "") });
  }
  return out;
}

function findSpec(specs: SpecPair[], re: RegExp): string | undefined {
  return specs.find((s) => re.test(s.label) || re.test(`${s.group} ${s.label}`))?.value;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseDegrees(raw: string | undefined): number | null {
  const n = parseNumber(raw);
  if (n == null) return null;
  if (n < 5 || n > 180) return null;
  return n;
}

function inferRoleFromText(text: string, aiType?: string | null): DesignRole | null {
  if (aiType && TYPE_TO_ROLE[aiType]) return TYPE_TO_ROLE[aiType];
  const t = text.toLowerCase();
  if (/\b(camera|cámara|cam\b|ptz|webcam)/i.test(t)) return "camera";
  if (/\b(mic|microphone|micrófono|mxa|beamforming)/i.test(t)) return "mic";
  if (/\b(display|monitor|television|tv\b|panel|led wall)/i.test(t)) return "display";
  if (/\b(touch|touchscreen|touchpanel|tsw-|tss-)/i.test(t)) return "touch";
  if (/\b(speaker|parlante|loudspeaker|soundbar|ceiling speaker)/i.test(t)) return "speaker";
  if (/\b(codec|uc engine|room system|compute)/i.test(t)) return "codec";
  if (/\b(processor|control processor|cp4|dsp|matrix)/i.test(t)) return "processor";
  return null;
}

function proxyForRole(role: DesignRole | null, diagonalIn: number | null): string | null {
  if (!role) return null;
  if (role === "display") {
    if (diagonalIn != null) {
      if (diagonalIn >= 80) return "tv_86";
      if (diagonalIn >= 70) return "tv_75";
      if (diagonalIn >= 60) return "tv_65";
      if (diagonalIn >= 50) return "tv_55";
      return "tv_43";
    }
    return "tv_65";
  }
  const map: Record<DesignRole, string> = {
    camera: "ptz_camera",
    mic: "ceiling_mic",
    display: "tv_65",
    speaker: "ceiling_speaker",
    touch: "touch_10",
    codec: "codec_box",
    processor: "rack_processor",
    furniture: "table_rect",
    other: "box_generic",
  };
  return map[role];
}

function completeness(draft: Omit<DesignProfileDraft, "completenessScore" | "confidenceScore" | "status">): {
  completenessScore: number;
  confidenceScore: number;
  status: DesignProfileDraft["status"];
} {
  const checks = [
    draft.designRole != null,
    draft.mountOptions.length > 0,
    draft.widthM != null,
    draft.heightM != null,
    draft.depthM != null,
    draft.hfovDeg != null || draft.coverageRadiusM != null || draft.diagonalIn != null,
    draft.proxyKey != null,
    draft.officialUrl != null,
  ];
  const hit = checks.filter(Boolean).length;
  const completenessScore = Math.round((hit / checks.length) * 1000) / 1000;
  const hasCoverage =
    draft.hfovDeg != null || draft.coverageRadiusM != null || draft.viewingDistanceMaxM != null;
  const confidenceScore = Math.round(
    ((draft.designRole ? 0.35 : 0) +
      (draft.widthM ? 0.2 : 0) +
      (hasCoverage ? 0.35 : 0) +
      (draft.officialUrl ? 0.1 : 0)) *
      1000,
  ) / 1000;

  let status: DesignProfileDraft["status"] = "pending";
  if (draft.designRole && completenessScore >= 0.5) status = "auto";
  if (hasCoverage && confidenceScore < 0.55) status = "needs_review";
  if (!draft.designRole) status = "pending";

  return { completenessScore, confidenceScore, status };
}

/** Extrae borrador de diseño desde campos ya persistidos en Product (+ AI profile opcional). */
export function draftDesignProfileFromProduct(product: ProductDesignSource): DesignProfileDraft {
  const specs = parseSpecs(product.specifications);
  const text = [
    product.normalizedName,
    product.modelNumber,
    product.categoryName,
    product.familyName,
    ...(product.aiApplications ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  const evidence: DesignProfileDraft["fieldEvidence"] = {};
  const designRole = inferRoleFromText(text, product.aiProductType);
  if (designRole) {
    evidence.designRole = {
      source: product.aiProductType ? "aiProfile.productType" : "name/category",
      note: product.aiProductType || text.slice(0, 80),
    };
  }

  const mountOptions = Array.from(
    new Set(
      (product.aiMountTypes ?? [])
        .map((m) => AI_MOUNT_TO_OPTION[m])
        .filter((m): m is MountOption => Boolean(m)),
    ),
  );

  const widthM = product.widthCm != null ? product.widthCm / 100 : null;
  const heightM = product.heightCm != null ? product.heightCm / 100 : null;
  const depthM = product.depthCm != null ? product.depthCm / 100 : null;
  if (widthM != null) evidence.widthM = { source: "product.widthCm", note: String(product.widthCm) };

  const fovRaw =
    findSpec(specs, /field\s*of\s*view|\bfov\b|ángulo|angulo|horizontal\s*fov/i) ??
    findSpec(specs, /viewing\s*angle/i);
  const hfovDeg = parseDegrees(fovRaw);
  if (hfovDeg != null) {
    evidence.hfovDeg = { source: "product.specifications", note: fovRaw ?? "" };
  }

  const rangeRaw = findSpec(specs, /range|alcance|distance.*camera|máx.*dist/i);
  const maxRangeM = parseNumber(rangeRaw);

  const diagRaw =
    findSpec(specs, /diagonal|screen\s*size|tamaño.*pantalla|pulgadas/i) ??
    text.match(/(\d{2,3})\s*"|\b(\d{2,3})\s*in\b/i)?.[0];
  let diagonalIn = parseNumber(typeof diagRaw === "string" ? diagRaw : undefined);
  if (diagonalIn != null && diagonalIn < 20) diagonalIn = null;

  let viewingDistanceMinM: number | null = null;
  let viewingDistanceMaxM: number | null = null;
  const viewRaw = findSpec(specs, /viewing\s*distance|distancia.*vision|distancia.*visión/i);
  if (viewRaw) {
    const nums = [...viewRaw.matchAll(/(\d+(\.\d+)?)/g)].map((m) => Number(m[1]));
    if (nums.length >= 2) {
      viewingDistanceMinM = nums[0];
      viewingDistanceMaxM = nums[1];
    }
  } else if (diagonalIn != null) {
    const v = viewingDistanceFromDiagonalIn(diagonalIn);
    viewingDistanceMinM = v.viewMinM;
    viewingDistanceMaxM = v.viewMaxM;
    evidence.viewingDistance = {
      source: "heuristic.diagonal",
      note: `${diagonalIn}"`,
    };
  }

  const micRadiusRaw = findSpec(specs, /pickup|coverage\s*radius|radio.*cobertura|alcance.*mic/i);
  const coverageRadiusM = parseNumber(micRadiusRaw);

  const roomCategories: string[] = [];
  if (product.isCrestronHomeCompatible) roomCategories.push("residential", "hotel");
  for (const app of product.aiApplications ?? []) {
    const a = app.toLowerCase();
    if (/office|oficina|meeting|reunión|boardroom/.test(a)) roomCategories.push("videoconference");
    if (/school|aula|educat|classroom|training/.test(a)) roomCategories.push("classroom", "training");
    if (/hotel|hospitality/.test(a)) roomCategories.push("hotel");
    if (/lobby|reception|retail/.test(a)) roomCategories.push("lobby");
    if (/home|residenc/.test(a)) roomCategories.push("residential");
    if (/event|auditor|theater|teatro/.test(a)) roomCategories.push("event");
  }

  const proxyKey = proxyForRole(designRole, diagonalIn);
  const base = {
    productId: product.id,
    designRole,
    roomCategories: Array.from(new Set(roomCategories)),
    mountOptions,
    defaultMountHeightM:
      designRole === "camera" && mountOptions.includes("wall")
        ? 1.85
        : designRole === "mic" && mountOptions.includes("ceiling")
          ? 2.55
          : null,
    widthM,
    heightM,
    depthM,
    weightKg: product.weight ?? null,
    hfovDeg,
    vfovDeg: null as number | null,
    maxRangeM,
    micPattern: null as string | null,
    coverageRadiusM,
    diagonalIn,
    viewingDistanceMinM,
    viewingDistanceMaxM,
    proxyKey,
    fieldEvidence: evidence,
    officialUrl: product.vendorProductUrl ?? null,
  };

  const scores = completeness(base);
  return { ...base, ...scores };
}
