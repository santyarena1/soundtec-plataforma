/**
 * Freno para los textos que genera la IA antes de guardarlos en la ficha
 * (descripción corta y larga): ficha del admin, generación masiva, cotizador
 * y edición rápida usan este mismo criterio.
 *
 * Un texto NO sirve si:
 *  - es el marcador fijo que el prompt le pide a la IA cuando no tiene datos;
 *  - es una negativa («Lo siento, no hay datos disponibles…», «No dispongo de información…»);
 *  - es el relleno que arman los generadores cuando no hay clave o la IA falla.
 */

/** Lo que el prompt le pide a la IA que conteste, sin nada más, cuando no tiene datos para escribir sin inventar. */
export const AI_NO_DATA_MARKER = "SIN_DATOS";

/** Error que ve el equipo cuando la IA no tiene datos del modelo. */
export const AI_NO_DATA_ERROR = "La IA no encontró datos de este modelo: completá la descripción corta o las especificaciones y probá de nuevo.";

/** Instrucción común de los prompts: no inventar y responder el marcador si no hay datos. */
export const AI_NO_DATA_INSTRUCTION = `No inventes datos: usá solo lo que te paso y lo que sepas con certeza de este modelo exacto. Si no tenés datos suficientes para escribir sin inventar, respondé exactamente ${AI_NO_DATA_MARKER} y nada más (sin disculpas ni explicaciones).`;

/** La IA contestó el marcador fijo de «sin datos» (solo o casi solo). */
export function isAiNoDataMarker(text: string): boolean {
  const t = text.trim().replace(/^["«'`*\s]+|["»'`*.\s]+$/g, "");
  return t.toUpperCase() === AI_NO_DATA_MARKER || (t.length <= 40 && t.toUpperCase().includes(AI_NO_DATA_MARKER));
}

// Arranque típico de una negativa: la respuesta entera es «no sé».
const REFUSAL_START =
  /^(lo siento|lamentablemente|disculp|perd[oó]n|no (tengo|hay|cuento con|dispongo de|puedo|encontr[eé]|se encontr|existe(n)? (datos|informaci[oó]n))|sin (datos|informaci[oó]n) (disponibles?|suficientes?|sobre|del|de este))/;
// Frases de negativa en cualquier parte: un texto válido de ficha no las dice.
const REFUSAL_ANYWHERE = [
  /\bno (tengo|dispongo de|cuento con|poseo) (informaci[oó]n|datos)\b/,
  /\bno hay (datos|informaci[oó]n) (disponibles?|espec[ií]fic|suficientes?|sobre|acerca|p[uú]blic)/,
  /\b(datos|informaci[oó]n) (espec[ií]fic[ao]s? )?no (est[aá]n? )?disponibles?\b/,
  /\bno (pude|puedo) (encontrar|proporcionar|brindar|ofrecer|generar|confirmar)\b/,
  /\bcomo (modelo de lenguaje|ia|inteligencia artificial|asistente)\b/,
  /\bmi (fecha de corte|conocimiento|base de conocimientos?|entrenamiento)\b/,
  /\b(te|le) (recomiendo|sugiero) (consultar|visitar|revisar|contactar)\b/,
];

/** La IA contestó que no sabe del producto («Lo siento, no hay datos…»): no es una descripción. */
export function isAiRefusal(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isAiNoDataMarker(text)) return true;
  if (REFUSAL_START.test(t.slice(0, 160))) return true;
  return REFUSAL_ANYWHERE.some((re) => re.test(t));
}

/** Relleno de los generadores cuando no hay clave o la IA falla (o un texto vacío). */
export function isDescriptionPlaceholder(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    /descripci[oó]n profesional no disponible en este momento\.?$/i.test(t) ||
    /descripci[oó]n t[eé]cnica profesional pendiente de generar/i.test(t) ||
    /\[a confirmar\]/i.test(t) ||
    // Relleno viejo del generador corto: «Marca Modelo: solución audiovisual profesional.»
    (t.length <= 220 && /^[^:\n]{1,160}: soluci[oó]n [^.:\n]{1,70}\.?$/i.test(t))
  );
}

/** Compatibilidad: nombre que usa la edición rápida. */
export const isLongDescriptionPlaceholder = isDescriptionPlaceholder;

export type AiTextVerdict = { ok: true; text: string } | { ok: false; reason: "empty" | "placeholder" | "no_data" };

/** Veredicto único para guardar (o no) un texto de la IA. */
export function checkAiDescription(text: string | null | undefined): AiTextVerdict {
  const t = (text ?? "").trim();
  if (!t) return { ok: false, reason: "empty" };
  if (isAiRefusal(t)) return { ok: false, reason: "no_data" };
  if (isDescriptionPlaceholder(t)) return { ok: false, reason: "placeholder" };
  return { ok: true, text: t };
}

/** true si el texto guardado es una negativa o relleno de IA (para limpiar datos existentes). */
export function isUnusableAiDescription(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  return Boolean(t) && !checkAiDescription(t).ok;
}
