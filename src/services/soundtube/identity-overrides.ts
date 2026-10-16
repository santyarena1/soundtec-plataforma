/**
 * Productos SoundTube que muestran el SKU y la descripción de la lista Excel
 * en vez de los del portal (elegido en la revisión). El sync los respeta.
 */

import { getSetting } from "@/lib/settings";

export const SOUNDTUBE_IDENTITY_KEY = "soundtube.identity";

/** Datos que se muestran en el catálogo en vez de los del portal. */
export interface IdentityOverride {
  name: string;
  originalName: string;
  modelNumber: string;
}

/** id de producto → identidad elegida (solo los que muestran los datos de la lista). */
export async function loadIdentityOverrides(): Promise<Map<string, IdentityOverride>> {
  try {
    const raw = JSON.parse(await getSetting(SOUNDTUBE_IDENTITY_KEY, "{}")) as Record<string, IdentityOverride>;
    return new Map(Object.entries(raw).filter(([, v]) => v && typeof v.name === "string" && typeof v.originalName === "string"));
  } catch {
    return new Map();
  }
}
