/**
 * ¿Qué parte de la ficha escribió la IA? Regla por campo, para el cartel
 * «Generado con IA» de la ficha (portal y admin). Ante la duda, NO se marca:
 * es peor decirle al cliente que un texto oficial lo inventó una IA.
 *
 *  - Descripción larga: solo si se generó con IA. Eso lo dejan juntos los que
 *    la generan (`aiGeneratedDescription` = true y `aiDescriptionFeedbackStatus`
 *    con valor). El flag solo, sin estado, lo dejaba la descripción CORTA
 *    (cotizaciones, botón «Generar con IA» del corto): no vale para la larga.
 *    Si el texto aparece en el HTML oficial del fabricante, es ficha oficial.
 *  - Descripción corta, características, especificaciones, documentos: nunca.
 *    Traducir una ficha oficial no es «generarla»; y para el corto no hay un
 *    dato confiable que diga si lo escribió la IA o una persona.
 */

export interface AiContentInput {
  aiGeneratedDescription: boolean | null | undefined;
  aiDescriptionFeedbackStatus: string | null | undefined;
  longDescription: string | null | undefined;
  htmlContent?: string | null;
}

export interface AiGeneratedFields {
  longDescription: boolean;
  shortDescription: false;
  keyFeatures: false;
  specifications: false;
}

const AI_LONG_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

function plain(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** El texto de la descripción ya está en el HTML que vino del fabricante (ficha oficial). */
export function longDescriptionComesFromOfficialHtml(longDescription: string | null | undefined, htmlContent: string | null | undefined): boolean {
  const long = plain(longDescription);
  const html = plain(htmlContent);
  if (!long || !html) return false;
  const probe = long.slice(0, 120);
  return probe.length >= 40 && html.includes(probe);
}

export function isLongDescriptionAiGenerated(p: AiContentInput): boolean {
  if (!p.aiGeneratedDescription) return false;
  if (!p.longDescription?.trim()) return false;
  if (!p.aiDescriptionFeedbackStatus || !AI_LONG_STATUSES.has(p.aiDescriptionFeedbackStatus)) return false;
  if (longDescriptionComesFromOfficialHtml(p.longDescription, p.htmlContent)) return false;
  return true;
}

export function aiGeneratedFields(p: AiContentInput): AiGeneratedFields {
  return { longDescription: isLongDescriptionAiGenerated(p), shortDescription: false, keyFeatures: false, specifications: false };
}
