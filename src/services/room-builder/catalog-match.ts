/**
 * Elegir del catálogo lo que resuelve una necesidad del diseño (un gateway
 * infiNET, un amplificador de baja impedancia, una matriz, un switch PoE…)
 * por las capacidades REALES de la ficha de cada producto, prefiriendo las
 * marcas del proyecto. El genérico queda solo para lo que no hay en el
 * catálogo (reproductores tipo Apple TV/Chromecast, motores de cortina…).
 */

import { prisma } from "@/lib/prisma";
import type { BrandGroup } from "./brief";
import type { IoCapabilities, IoPort, IoSignal } from "./io-profile/types";

type Candidate = {
  id: string;
  name: string;
  brandSlug: string | null;
  brandName: string | null;
  productType: string | null;
  ports: IoPort[];
  caps: IoCapabilities;
};

/** Productos con ficha validada (se cachean unos minutos: el catálogo cambia poco). */
const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; rows: Candidate[] } | null = null;

async function candidates(): Promise<Candidate[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = await prisma.product.findMany({
    where: { isActive: true, isDiscontinued: false, ioProfile: { is: { status: { in: ["auto", "approved"] } } } },
    select: {
      id: true,
      normalizedName: true,
      brand: { select: { slug: true, name: true } },
      aiProfile: { select: { productType: true } },
      ioProfile: { select: { ports: true, capabilities: true } },
    },
  });
  const list = rows.map((r) => ({
    id: r.id,
    name: r.normalizedName,
    brandSlug: r.brand?.slug ?? null,
    brandName: r.brand?.name ?? null,
    productType: r.aiProfile?.productType ?? null,
    ports: (Array.isArray(r.ioProfile?.ports) ? r.ioProfile!.ports : []) as unknown as IoPort[],
    caps: (r.ioProfile?.capabilities && typeof r.ioProfile.capabilities === "object" ? r.ioProfile.capabilities : {}) as unknown as IoCapabilities,
  }));
  cache = { at: Date.now(), rows: list };
  return list;
}

const count = (c: Candidate, signals: IoSignal[], dir: "in" | "out") => c.ports.filter((p) => signals.includes(p.signal) && (p.direction === dir || p.direction === "bidir")).reduce((a, p) => a + p.count, 0);
const radio = (c: Candidate, protocol: string, role: string) => (c.caps.wireless?.value ?? []).find((w) => w.protocol === protocol && w.role === role) ?? null;
const pse = (c: Candidate) => c.ports.filter((p) => p.signal === "lan" && p.poe === "pse").reduce((a, p) => a + p.count, 0);
const lineV = (c: Candidate) => c.caps.lineVoltage?.value ?? null;
const SPARE = /kit de montaje|bracket|mount|repuesto|cable|license|licencia|software|\bSW-/i;

/** Qué necesita cada solución: puntaje > 0 = sirve (más alto = mejor) y el grupo de marcas del proyecto que aplica. */
const NEEDS: Record<string, { group: BrandGroup; score: (c: Candidate) => number }> = {
  // Gateway dedicado antes que un procesador con radio (un procesador cambia el diseño del control).
  "infinet-gateway": { group: "control", score: (c) => (radio(c, "infinet", "gateway") ? 10 + (/\bGW|gateway/i.test(c.name) ? 6 : 0) - Math.min(c.ports.reduce((a, p) => a + p.count, 0), 30) / 10 : 0) },
  "zum-bridge": { group: "control", score: (c) => (radio(c, "zum-mesh", "gateway") ? 10 : 0) },
  "zigbee-gateway": { group: "control", score: (c) => (radio(c, "zigbee", "gateway") ? 10 : 0) },
  "wireless-mic": { group: "audio", score: (c) => (radio(c, "rf-mic", "receiver") ? 10 : 0) },
  "wireless-presentation": { group: "video", score: (c) => (radio(c, "wireless-presentation", "base") && count(c, ["hdmi"], "out") > 0 ? 10 : 0) },
  "amp-4ch": {
    group: "amplification",
    score: (c) => {
      const outs = count(c, ["speaker"], "out");
      const lv = lineV(c);
      if (outs < 2 || (lv && lv !== "low-z" && lv !== "both") || /SUB|subwoofer/i.test(c.name)) return 0;
      return 5 + Math.min(outs, 8) / 2;
    },
  },
  "amp-70v": {
    group: "amplification",
    score: (c) => {
      const outs = count(c, ["speaker"], "out");
      const lv = lineV(c);
      return outs >= 1 && (lv === "70v" || lv === "100v" || lv === "both") ? 5 + Math.min(outs, 8) / 2 : 0;
    },
  },
  "audio-streamer": {
    group: "streaming",
    score: (c) => {
      // Un streamer de música: sin parlantes, sin video y sin presentación inalámbrica.
      if (count(c, ["speaker"], "out") > 0 || count(c, ["hdmi", "displayport", "hdbaset"], "out") > 0 || radio(c, "wireless-presentation", "base")) return 0;
      const streams = radio(c, "airplay", "base") || radio(c, "chromecast", "base") || /\bstream|NAX-AP|\bSTR\b/i.test(c.name);
      return streams && count(c, ["analog-audio", "digital-audio", "dante"], "out") > 0 ? 8 : 0;
    },
  },
  "poe-switch-8": { group: "control", score: (c) => (pse(c) >= 8 ? 10 - Math.min(pse(c), 48) / 20 : 0) },
  "poe-switch-24": { group: "control", score: (c) => (pse(c) >= 24 ? 10 - Math.min(pse(c), 48) / 20 : 0) },
  "matrix-4x4": { group: "video", score: (c) => (count(c, ["hdmi"], "in") >= 4 && count(c, ["hdmi", "hdbaset"], "out") >= 2 ? 10 - Math.abs(count(c, ["hdmi"], "in") - 4) / 4 : 0) },
  "matrix-8x8": { group: "video", score: (c) => (count(c, ["hdmi"], "in") >= 8 && count(c, ["hdmi", "hdbaset"], "out") >= 8 ? 10 : 0) },
  dsp: {
    group: "audio",
    score: (c) => (count(c, ["speaker"], "out") === 0 && count(c, ["mic", "analog-audio", "dante"], "in") >= 4 && count(c, ["analog-audio", "dante"], "out") >= 2 && /dsp|processor|procesador|tesira|q-sys|core/i.test(`${c.name} ${c.productType}`) ? 8 : 0),
  },
  "control-processor": { group: "control", score: (c) => (count(c, ["rs232"], "out") + count(c, ["ir"], "out") >= 2 && count(c, ["lan"], "in") > 0 && /processor|control|MC4|CP4|PRO4|RMC/i.test(`${c.name} ${c.productType}`) ? 8 : 0) },
  "shade-motor": { group: "control", score: (c) => (/\b(shade|shades|cortina|cortinas|persiana|drape|roller shade)\b|motor de cortina/i.test(c.name) && !/controller|hvac|thermostat/i.test(c.name) && (c.ports.length > 0 || c.caps.wireless) ? 8 : 0) },
  "keypad-wired": { group: "control", score: (c) => (/\bKP|keypad|teclado|KPEX|KPCN|\bC2N-CB|CBD/i.test(c.name) && !/BTN|ENGRAVED|BLANK|FP-|FACEPLATE/i.test(c.name) && (c.ports.length > 0 || c.caps.wireless) ? 6 + (radio(c, "infinet", "client") ? 1 : 0) : 0) },
  "keypad-zigbee": { group: "control", score: (c) => (/\bKP|keypad|teclado/i.test(c.name) && radio(c, "zigbee", "client") ? 8 : 0) },
  "dimmer": { group: "control", score: (c) => (/DIM|dimmer/i.test(c.name) && !/BTN|ENGRAVED|BLANK|FP-|FACEPLATE|LCD/i.test(c.name) && (c.ports.length > 0 || c.caps.wireless) ? 6 : 0) },
  "handheld-remote": { group: "control", score: (c) => (/\bHR-\d|\bTSR-\d/i.test(c.name) && !/BTN|ENGRAVED|BLANK|DS\b|-DS-|CRADLE|DOCK/i.test(c.name) ? 7 + (radio(c, "infinet", "client") ? 1 : 0) : 0) },
  "touch-panel": { group: "control", score: (c) => (/TSW|TS-|touch|táctil/i.test(c.name) && count(c, ["lan"], "in") > 0 ? 6 : 0) },
};

export type CatalogPick = { productId: string; name: string };

/** El mejor producto del catálogo para una solución, o null si no hay (entonces va el genérico). */
/**
 * Plataforma de control: Crestron Home trabaja con los procesadores residenciales "-R"
 * (CP4-R, MC4-R, DIN-AP4-R…); Crestron programado con la línea estándar (CP4, MC4, PRO4).
 */
function platformBonus(c: Candidate, platform: string | null): number {
  if (!platform || platform === "none" || !/crestron/i.test(c.brandName ?? c.brandSlug ?? "")) return 0;
  const residential = /-R(-I)?\b|-R-/i.test(c.name) || /crestron home/i.test(c.name);
  const processor = /\b(CP4|MC4|PRO4|DIN-AP4|RMC4|CP4N|MC4-R)/i.test(c.name);
  if (!processor) return 0;
  if (platform === "crestron-home") return residential ? 4 : -4;
  if (platform === "crestron-pro") return residential ? -2 : 2;
  return 0;
}

export async function catalogFor(genericKey: string, brands: Partial<Record<BrandGroup, string[]>> = {}, projectBrands: string[] = [], platform: string | null = null): Promise<CatalogPick | null> {
  const need = NEEDS[genericKey];
  if (!need) return null;
  const preferred = new Set([...(brands[need.group] ?? []), ...projectBrands].map((b) => b.toLowerCase()));
  let best: { c: Candidate; s: number } | null = null;
  for (const c of await candidates()) {
    if (SPARE.test(c.name)) continue;
    let s = need.score(c);
    if (s <= 0) continue;
    if (c.brandSlug && preferred.has(c.brandSlug.toLowerCase())) s += 5;
    s += platformBonus(c, platform);
    // En proyectos con control Crestron, la interfaz (teclas, remotos, paneles, gateways) es Crestron.
    if (need.group === "control" && platform && platform.startsWith("crestron") && /crestron/i.test(c.brandName ?? "")) s += 3;
    if (!best || s > best.s) best = { c, s };
  }
  return best ? { productId: best.c.id, name: [best.c.brandName, best.c.name].filter(Boolean).join(" ") } : null;
}
