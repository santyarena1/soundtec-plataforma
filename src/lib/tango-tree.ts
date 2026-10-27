/**
 * Árbol de rubros de Tango: lectura del CSV que exporta Tango y nombres legibles.
 * El CSV trae hasta 5 niveles; se usan 4 (el quinto casi no tiene filas).
 */
export const TANGO_MAX_LEVEL = 4;
export const TANGO_SEPARATOR = " > ";

/** Ramas que Soundtec agregó y todavía no están en el CSV de Tango (se cargan igual; agregarlas también en Tango). */
export const TANGO_EXTRA_PATHS = ["SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR"];

export type TangoNode = { path: string; parts: string[]; level: number; parentPath: string | null };

/** Lee el CSV de Tango («Rubro;Subrubro;Nivel 3;Nivel 4;Nivel 5», con comillas) y devuelve los nodos únicos, padres antes que hijos. */
export function parseTangoTree(csv: string): TangoNode[] {
  const nodes = new Map<string, TangoNode>();
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const extras = TANGO_EXTRA_PATHS.map((path) => path.split(TANGO_SEPARATOR).map((p) => `"${p}"`).join(";"));
  for (const line of [...lines.slice(1), ...extras]) {
    const parts = line
      .split(";")
      .map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/\s+/g, " ").trim())
      .slice(0, TANGO_MAX_LEVEL);
    const filled = parts.slice(0, parts.findIndex((p) => !p) === -1 ? parts.length : parts.findIndex((p) => !p));
    for (let i = 1; i <= filled.length; i++) {
      const path = filled.slice(0, i).join(TANGO_SEPARATOR);
      if (!nodes.has(path)) nodes.set(path, { path, parts: filled.slice(0, i), level: i, parentPath: i > 1 ? filled.slice(0, i - 1).join(TANGO_SEPARATOR) : null });
    }
  }
  return [...nodes.values()].sort((a, b) => a.level - b.level || a.path.localeCompare(b.path, "es"));
}

/** Siglas que quedan en mayúsculas. */
const ACRONYMS = new Set(["PA", "DJ", "LED", "DMX", "DC", "AC", "AV", "TV", "PC", "USB", "HDMI", "VGA", "DVI", "SDI", "RCA", "XLR", "IP", "RF", "UHF", "VHF", "IR", "MDF", "PVC", "UPS", "CCTV", "LCD", "DSP", "MIDI", "POE", "HD", "UV", "CD", "DVD", "SMD", "SMT", "UTP", "FTP", "RJ45", "BNC", "SD", "PTZ", "NVR", "DVR", "KVM", "ISO"]);

/** «BAFLES PASIVOS» → «Bafles pasivos»; respeta siglas y los «P/» de Tango. */
export function tangoDisplayName(raw: string): string {
  const words = raw.trim().split(/\s+/);
  return words
    .map((word, index) => {
      const bare = word.replace(/[^A-Z0-9ÁÉÍÓÚÑÜ]/gi, "").toUpperCase();
      if (ACRONYMS.has(bare) || /\d/.test(word)) return word.toUpperCase();
      const lower = word.toLocaleLowerCase("es-AR");
      return index === 0 ? lower.charAt(0).toLocaleUpperCase("es-AR") + lower.slice(1) : lower;
    })
    .join(" ");
}

/** Ruta legible: «Sonido › Bafles pasivos › Embutir». */
export function tangoPathLabel(path: string): string {
  return path.split(TANGO_SEPARATOR).map(tangoDisplayName).join(" › ");
}
