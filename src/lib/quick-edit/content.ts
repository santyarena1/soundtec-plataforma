/**
 * Contenido enriquecido de la ficha (características, especificaciones y
 * documentos) en la forma que edita la edición rápida, y de vuelta a la forma
 * que guarda la base y lee la ficha del portal (product-rich-info).
 */
import { z } from "zod";

export interface SpecRow {
  group: string;
  label: string;
  value: string;
}

export interface DocRow {
  name: string;
  url: string;
}

export const MAX_FEATURES = 40;
export const MAX_SPECS = 300;
export const MAX_DOCS = 60;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

/** Características guardadas → lista editable. */
export function featuresFromJson(value: unknown): string[] {
  return asArray(value).map(str).filter(Boolean);
}

/** Especificaciones guardadas → filas editables (en castellano si hay traducción). */
export function specsFromJson(value: unknown): SpecRow[] {
  return asArray(value)
    .map((raw) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const attr = Array.isArray(s.attributeValues)
        ? (s.attributeValues as Array<Record<string, unknown>>).map((a) => str(a.valueDisplay) || str(a.value)).filter(Boolean).join(" · ")
        : "";
      return { group: str(s.group), label: str(s.labelEs) || str(s.label) || str(s.name), value: str(s.valueEs) || str(s.value) || attr };
    })
    .filter((r) => r.label || r.value);
}

/** Documentos guardados → filas editables. */
export function docsFromJson(value: unknown): DocRow[] {
  return asArray(value)
    .map((raw) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      return { name: str(d.nameEs) || str(d.name) || str(d.description), url: str(d.fileUrl) || str(d.url) || str(d.filePath) };
    })
    .filter((d) => d.url);
}

const featureSchema = z.array(z.string().trim().max(400, "Cada característica: máximo 400 caracteres.")).max(MAX_FEATURES, `Máximo ${MAX_FEATURES} características.`);
const specSchema = z
  .array(z.object({ group: z.string().trim().max(80), label: z.string().trim().max(160), value: z.string().trim().max(1000) }))
  .max(MAX_SPECS, `Máximo ${MAX_SPECS} especificaciones.`);
const docSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Cada documento necesita un nombre.").max(200),
      url: z
        .string()
        .trim()
        .url("La dirección del documento no es válida.")
        .refine((u) => /^https?:\/\//i.test(u), "La dirección tiene que empezar con http:// o https://."),
    })
  )
  .max(MAX_DOCS, `Máximo ${MAX_DOCS} documentos.`);

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

/** Lista para guardar: sin vacías ni repetidas. */
export function cleanFeatures(input: unknown): Parsed<string[]> {
  const parsed = featureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const seen = new Set<string>();
  return {
    ok: true,
    data: parsed.data.filter((f) => {
      const key = f.toLocaleLowerCase("es-AR");
      if (!f || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

/** Filas para guardar. Una fila con rótulo y sin valor (o al revés) es un error, no se descarta en silencio. */
export function cleanSpecs(input: unknown): Parsed<Array<{ group?: string; label: string; value: string; labelEs: string; valueEs: string }>> {
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const rows = parsed.data.filter((r) => r.label || r.value);
  const incomplete = rows.findIndex((r) => !r.label || !r.value);
  if (incomplete >= 0) return { ok: false, error: `La especificación ${incomplete + 1} necesita rótulo y valor.` };
  return {
    ok: true,
    data: rows.map((r) => ({ ...(r.group ? { group: r.group } : {}), label: r.label, value: r.value, labelEs: r.label, valueEs: r.value })),
  };
}

export function cleanDocs(input: unknown): Parsed<Array<{ name: string; nameEs: string; url: string }>> {
  const parsed = docSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return { ok: true, data: parsed.data.map((d) => ({ name: d.name, nameEs: d.name, url: d.url })) };
}

/**
 * Marca de IA al guardar los textos de la edición rápida (criterio de src/lib/ai-content.ts):
 * si la descripción larga que se guarda salió del botón de IA (aunque después se retocara a mano),
 * queda marcada como generada (flag + estado de revisión) para el cartel «Generado con IA».
 * Si no se usó la IA, no se toca la marca: un guardado a mano no la pone ni la saca.
 */
export function aiFlagsForTextSave(input: { longFromAi: boolean; longDescription: string }): { aiGeneratedDescription: true; aiDescriptionFeedbackStatus: "PENDING" } | null {
  if (!input.longFromAi || !input.longDescription.trim()) return null;
  return { aiGeneratedDescription: true, aiDescriptionFeedbackStatus: "PENDING" };
}
