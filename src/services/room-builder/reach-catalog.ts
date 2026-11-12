/**
 * Qué hay en el catálogo para resolver un tramo que se pasa del alcance de su
 * señal: HDMI óptico activo (AOC), USB activo, extensor USB por UTP y
 * extensor/receptor HDBaseT. El motor los nombra en sus avisos; si no hay,
 * recomienda el genérico. Se cachea unos minutos (el catálogo cambia poco).
 */

import { loadCableCatalog } from "./cable-catalog";
import { catalogFor } from "./catalog-match";
import type { ReachCatalog } from "./signal-reach";

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; value: ReachCatalog } | null = null;

export async function reachCatalog(): Promise<ReachCatalog> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const [cables, rx, tx, usbExt] = await Promise.all([loadCableCatalog(), catalogFor("hdbaset-rx"), catalogFor("hdbaset-tx"), catalogFor("usb-extender")]);
    // El cable activo más largo de cada señal (cubre la mayor cantidad de tramos).
    const longest = (signal: "hdmi" | "usb") =>
      cables.filter((c) => c.signal === signal && c.kind === "patch" && c.extended).sort((a, b) => (b.lengthM ?? 0) - (a.lengthM ?? 0))[0] ?? null;
    const aoc = longest("hdmi");
    const usb = longest("usb");
    const value: ReachCatalog = {
      hdmiAoc: aoc ? { name: [aoc.brand, aoc.name].filter(Boolean).join(" "), lengthM: aoc.lengthM } : null,
      usbActive: usb ? { name: [usb.brand, usb.name].filter(Boolean).join(" "), lengthM: usb.lengthM } : null,
      usbExtender: usbExt ? { name: usbExt.name } : null,
      hdbasetTx: tx ? { name: tx.name } : null,
      hdbasetRx: rx ? { name: rx.name } : null,
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    // Sin catálogo los avisos recomiendan el genérico: el cableado no se frena por esto.
    console.warn("[room-builder/reach-catalog] no se pudo leer el catálogo", error instanceof Error ? error.message : error);
    return {};
  }
}
