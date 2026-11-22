/**
 * Lógica pura del aviso de «cambios sin guardar» (sin React ni DOM real, para poder probarla).
 *
 * - `stableSerialize` / `isSameValue`: comparan el estado actual contra el inicial
 *   (no alcanza con «tocó un campo»: si vuelve al valor original, no hay cambios).
 * - `shouldGuardLinkClick`: decide si un click en un enlace es una salida de la pantalla
 *   que hay que frenar (respeta ctrl/cmd/rueda, target=_blank, descargas, anclas #…).
 * - `serializeFormControls`: foto de los valores de un formulario (inputs no controlados).
 */

export const DEFAULT_UNSAVED_MESSAGE = "Tenés cambios sin guardar. Si salís ahora, se pierden.";

/** JSON estable: ordena las claves, trata undefined como ausente, Date como ISO, Set/Map como listas. */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalize(value, new WeakSet()));
}

function normalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    if (typeof value === "bigint") return value.toString();
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => normalize(item, seen));
  if (value instanceof Set) return [...value].map((item) => normalize(item, seen)).map((v) => JSON.stringify(v)).sort();
  if (value instanceof Map) return normalize(Object.fromEntries(value), seen);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined || typeof item === "function") continue;
    out[key] = normalize(item, seen);
  }
  return out;
}

export function isSameValue(a: unknown, b: unknown): boolean {
  return stableSerialize(a) === stableSerialize(b);
}

// ─── Clicks en enlaces ───────────────────────────────────────────────

export type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

export type AnchorLike = {
  /** Atributo href tal cual está escrito (puede ser relativo, «#…», «mailto:»…). */
  href: string | null;
  target?: string | null;
  download?: boolean;
  /** data-unsaved-guard="ignore" para enlaces que no sacan de la pantalla. */
  ignore?: boolean;
};

export type LinkDecision = { guard: false } | { guard: true; url: URL; external: boolean };

/**
 * ¿Este click saca al usuario de la pantalla actual (en la misma pestaña)?
 * `current` es la URL de la página (window.location.href).
 */
export function shouldGuardLinkClick(event: ClickLike, anchor: AnchorLike, current: string): LinkDecision {
  if (event.defaultPrevented) return { guard: false };
  if (event.button !== 0) return { guard: false }; // rueda / botón derecho
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return { guard: false }; // pestaña/ventana nueva, descarga
  if (anchor.ignore) return { guard: false };
  if (anchor.download) return { guard: false };
  const target = (anchor.target ?? "").trim().toLowerCase();
  if (target && target !== "_self") return { guard: false };
  const raw = (anchor.href ?? "").trim();
  if (!raw || raw.startsWith("#")) return { guard: false };
  if (/^(javascript|mailto|tel|sms|whatsapp|blob|data):/i.test(raw)) return { guard: false };

  let url: URL;
  let here: URL;
  try {
    here = new URL(current);
    url = new URL(raw, here);
  } catch {
    return { guard: false };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { guard: false };
  const external = url.origin !== here.origin;
  // Mismo lugar (solo cambia el ancla o es exactamente la misma URL): no sale de la pantalla.
  if (!external && url.pathname === here.pathname && url.search === here.search) return { guard: false };
  return { guard: true, url, external };
}

// ─── Foto de un formulario ───────────────────────────────────────────

export type ControlLike = {
  name: string;
  type: string;
  value: string;
  checked?: boolean;
  /** Para <select multiple>. */
  selectedValues?: string[];
  /** Para <input type=file>: cantidad de archivos elegidos. */
  fileCount?: number;
  /** data-unsaved-guard="ignore" (buscadores, filtros dentro del form). */
  ignore?: boolean;
};

/** Serializa los controles en orden (el orden del DOM cuenta: agregar/quitar filas es un cambio). */
export function serializeFormControls(controls: ControlLike[]): string {
  const parts: string[] = [];
  for (const control of controls) {
    if (control.ignore) continue;
    const type = control.type.toLowerCase();
    if (["submit", "button", "reset", "image"].includes(type)) continue;
    const key = control.name || "";
    if (type === "checkbox" || type === "radio") parts.push(`${key}:${control.value}=${control.checked ? 1 : 0}`);
    else if (type === "file") parts.push(`${key}=files:${control.fileCount ?? 0}`);
    else if (control.selectedValues) parts.push(`${key}=${JSON.stringify(control.selectedValues)}`);
    else parts.push(`${key}=${JSON.stringify(control.value)}`);
  }
  return parts.join("\n");
}

// ─── Autoguardado ────────────────────────────────────────────────────

export type AutosaveStatus = "idle" | "saved" | "pending" | "saving" | "error";

/** Con autoguardado solo se avisa si queda algo sin guardar: pendiente, guardando o con error. */
export function autosaveNeedsWarning(status: AutosaveStatus): boolean {
  return status === "pending" || status === "saving" || status === "error";
}
