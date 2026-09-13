/**
 * Material de entrada del perfil: junta todo lo que sabemos de un producto y
 * extrae primero lo que se puede leer sin modelo.
 *
 * Regla: si un dato se puede sacar con una expresión regular sobre la ficha,
 * se saca acá. El modelo solo se usa para lo que requiere criterio
 * (clasificar, resumir, decidir si algo es para exterior).
 */

import { createHash } from "node:crypto";
import type { AudioLine, Ecosystem, MountType } from "./vocab";

export interface ProfileSourceRow {
  id: string;
  normalizedName: string;
  originalName: string;
  shortDescription: string | null;
  longDescription: string | null;
  htmlContent: string | null;
  keyFeatures: unknown;
  specifications: unknown;
  sourceMetadata: unknown;
  sourceCategoryPath: string | null;
  productLine: string | null;
  modelNumber: string | null;
  isCrestronHomeCompatible: boolean;
  isDiscontinued: boolean;
  brand: { name: string } | null;
  category: { name: string } | null;
  family: { name: string } | null;
}

export interface SpecPair {
  label: string;
  value: string;
}

/** Datos que se leen directo de la ficha, sin criterio y sin tokens. */
export interface HardFacts {
  ipRating: string | null;
  audioLine: AudioLine | null;
  powerWatts: number | null;
  impedanceOhms: number | null;
  hdmiInputs: number | null;
  ecosystems: Ecosystem[];
  mountTypes: MountType[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function htmlToText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSpecs(value: unknown): SpecPair[] {
  if (!Array.isArray(value)) return [];
  const out: SpecPair[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const label = text(row.labelEs) || text(row.label) || text(row.name);
    const val = text(row.valueEs) || text(row.value);
    if (label && val) out.push({ label, value: val });
  }
  return out;
}

export function parseFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : text((item as Record<string, unknown>)?.text)))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Texto plano del raw del portal. Trae campos que la normalización descarta
 * (bullets de aplicación, familias, notas de instalación) y que son justo los
 * que definen si un producto sirve para un ambiente.
 */
export function rawMetadataText(value: unknown, maxChars = 1200): string {
  if (!value || typeof value !== "object") return "";
  const parts: string[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 3 || parts.join(" ").length > maxChars * 2) return;
    if (typeof node === "string") {
      const clean = node.replace(/\s+/g, " ").trim();
      if (clean.length >= 12 && !/^https?:\/\//i.test(clean)) parts.push(clean);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 20)) walk(item, depth + 1);
      return;
    }
    if (node && typeof node === "object") {
      for (const item of Object.values(node as Record<string, unknown>).slice(0, 30)) {
        walk(item, depth + 1);
      }
    }
  };
  walk(value, 0);
  return Array.from(new Set(parts)).join(" · ").slice(0, maxChars);
}

const MOUNT_PATTERNS: Array<{ mount: MountType; re: RegExp }> = [
  { mount: "in-ceiling", re: /\bin[-\s]?ceiling\b|\bceiling\s?(mount|speaker|tile)\b|embutir en techo/i },
  { mount: "in-wall", re: /\bin[-\s]?wall\b|embutir en pared/i },
  { mount: "on-wall", re: /\bon[-\s]?wall\b/i },
  { mount: "surface", re: /\bsurface[-\s]?mount\b|montaje en superficie/i },
  { mount: "pendant", re: /\bpendant\b/i },
  { mount: "rack", re: /\brack[-\s]?mount\b|\b\d+ru\b|\b1u\b|\b2u\b/i },
  { mount: "landscape", re: /\blandscape\b|\bgarden\b|\bin[-\s]?ground\b|jard[íi]n/i },
  { mount: "pole", re: /\bpole[-\s]?mount\b/i },
  { mount: "desktop", re: /\btabletop\b|\bdesktop\b|\bdesk[-\s]?mount\b/i },
  { mount: "portable", re: /\bportable\b|\bport[áa]til\b/i },
  { mount: "flush", re: /\bflush[-\s]?mount\b/i },
];

const ECOSYSTEM_PATTERNS: Array<{ key: Ecosystem; re: RegExp }> = [
  { key: "crestron-home", re: /crestron\s+home/i },
  { key: "control4", re: /\bcontrol4\b/i },
  { key: "savant", re: /\bsavant\b/i },
  { key: "sonos", re: /\bsonos\b/i },
  { key: "dante", re: /\bdante\b/i },
  { key: "aes67", re: /\baes\s?-?67\b/i },
  { key: "airplay", re: /\bairplay\b/i },
  { key: "poe", re: /\bpoe\+?\b|power over ethernet/i },
  { key: "bluetooth", re: /\bbluetooth\b/i },
  { key: "wifi", re: /\bwi-?fi\b|\b802\.11/i },
  { key: "hdmi", re: /\bhdmi\b/i },
  { key: "usb-c", re: /\busb[-\s]?c\b|usb type[-\s]?c/i },
  { key: "avb", re: /\bavb\b/i },
];

/** "IP66", "IP-66", "IPX5" → "IP66" / "IPX5". */
function findIpRating(haystack: string): string | null {
  const match = haystack.match(/\bIP[\s-]?(\d{2}|X\d|\dX)\b/i);
  if (!match) return null;
  return `IP${match[1].toUpperCase()}`;
}

function findAudioLine(haystack: string): AudioLine | null {
  const has70 = /\b70\s?-?\s?v(olt)?\b/i.test(haystack);
  const has100 = /\b100\s?-?\s?v(olt)?\b/i.test(haystack);
  const hasLowZ = /\b(4|8|16)\s?(ohm|Ω)\b/i.test(haystack) || /low[-\s]?impedance/i.test(haystack);
  if (has70 && has100) return "BOTH";
  if (has70) return "70V";
  if (has100) return "100V";
  if (hasLowZ) return "LOW_Z";
  return null;
}

function findNumber(specs: SpecPair[], labelRe: RegExp, valueRe: RegExp): number | null {
  for (const spec of specs) {
    if (!labelRe.test(spec.label)) continue;
    const match = spec.value.match(valueRe);
    if (!match) continue;
    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function deriveHardFacts(row: ProfileSourceRow, haystack: string): HardFacts {
  const specs = parseSpecs(row.specifications);
  const ecosystems = ECOSYSTEM_PATTERNS.filter(({ re }) => re.test(haystack)).map(({ key }) => key);
  if (row.isCrestronHomeCompatible && !ecosystems.includes("crestron-home")) {
    ecosystems.unshift("crestron-home");
  }
  return {
    ipRating: findIpRating(haystack),
    audioLine: findAudioLine(haystack),
    powerWatts: findNumber(specs, /power|potencia|watt|rms/i, /(\d+(?:[.,]\d+)?)\s*w/i),
    impedanceOhms: findNumber(specs, /impedance|impedancia/i, /(\d+(?:[.,]\d+)?)\s*(?:ohm|Ω)/i),
    hdmiInputs: findNumber(specs, /hdmi.*(input|entrada)|(input|entrada).*hdmi/i, /(\d+)/),
    ecosystems: ecosystems.slice(0, 8),
    mountTypes: MOUNT_PATTERNS.filter(({ re }) => re.test(haystack))
      .map(({ mount }) => mount)
      .slice(0, 5),
  };
}

export interface BuiltSource {
  /** Texto que ve el modelo. */
  prompt: string;
  /** Texto completo (incluye HTML) contra el que corren las regex. */
  haystack: string;
  hardFacts: HardFacts;
  /** Cambia si cambió cualquier dato de origen: dispara reproceso. */
  hash: string;
}

const MAX_HTML = 3500;
const MAX_LONG = 1200;

export function buildSource(row: ProfileSourceRow): BuiltSource {
  const specs = parseSpecs(row.specifications);
  const features = parseFeatures(row.keyFeatures);
  const html = htmlToText(row.htmlContent);
  const raw = rawMetadataText(row.sourceMetadata);

  const haystack = [
    row.normalizedName,
    row.originalName,
    row.brand?.name,
    row.category?.name,
    row.family?.name,
    row.sourceCategoryPath,
    row.productLine,
    row.shortDescription,
    row.longDescription,
    features.join(" · "),
    specs.map((spec) => `${spec.label}: ${spec.value}`).join(" · "),
    html,
    raw,
  ]
    .filter(Boolean)
    .join(" \n ");

  const hardFacts = deriveHardFacts(row, haystack);

  const lines: string[] = [];
  lines.push(`NOMBRE: ${row.normalizedName || row.originalName}`);
  if (row.brand?.name) lines.push(`MARCA: ${row.brand.name}`);
  if (row.category?.name) lines.push(`CATEGORÍA: ${row.category.name}`);
  if (row.sourceCategoryPath) lines.push(`CATEGORÍA DEL FABRICANTE: ${row.sourceCategoryPath}`);
  if (row.family?.name) lines.push(`FAMILIA: ${row.family.name}`);
  if (row.productLine) lines.push(`LÍNEA: ${row.productLine}`);
  if (row.modelNumber) lines.push(`MODELO: ${row.modelNumber}`);
  if (row.isDiscontinued) lines.push("ESTADO: discontinuado por el fabricante");
  if (row.shortDescription) lines.push(`DESCRIPCIÓN: ${row.shortDescription.slice(0, 600)}`);
  if (features.length > 0) {
    lines.push(`CARACTERÍSTICAS: ${features.slice(0, 12).map((f) => f.slice(0, 160)).join(" | ")}`);
  }
  if (specs.length > 0) {
    lines.push(
      `ESPECIFICACIONES: ${specs
        .slice(0, 40)
        .map((spec) => `${spec.label.slice(0, 60)}: ${spec.value.slice(0, 90)}`)
        .join(" | ")}`
    );
  }
  if (row.longDescription) lines.push(`DETALLE: ${row.longDescription.slice(0, MAX_LONG)}`);
  if (html) lines.push(`FICHA DEL FABRICANTE: ${html.slice(0, MAX_HTML)}`);
  if (raw) lines.push(`DATOS DEL PORTAL: ${raw}`);

  const prompt = lines.join("\n");

  return {
    prompt,
    haystack,
    hardFacts,
    hash: createHash("sha256").update(prompt).digest("hex").slice(0, 32),
  };
}
