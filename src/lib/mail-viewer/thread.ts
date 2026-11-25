/**
 * Conversación simple: un mensaje, los que cita (In-Reply-To/References) y los
 * que lo citan a él. Puro.
 */

/** <abc@host> normalizado (sin espacios ni caracteres raros), o null. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f"\\\s]/g, "").replace(/^<|>$/g, "");
  if (!cleaned || cleaned.length > 250 || !cleaned.includes("@")) return null;
  return `<${cleaned}>`;
}

/** Ids de References/In-Reply-To (vienen como «<a@x> <b@y>»). */
export function splitReferences(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const text = Array.isArray(value) ? value.join(" ") : value;
  return [...text.matchAll(/<[^<>\s]+>/g)].map((m) => normalizeMessageId(m[0])).filter((v): v is string => Boolean(v));
}

/** Ids a buscar para armar la conversación (los más cercanos primero, con tope). */
export function threadLookupIds(message: { messageId: string | null; inReplyTo: string | null; references: string[] }, max = 8): string[] {
  const ids = [normalizeMessageId(message.inReplyTo), ...[...message.references].reverse().map(normalizeMessageId)].filter((v): v is string => Boolean(v));
  const own = normalizeMessageId(message.messageId);
  return [...new Set(ids)].filter((id) => id !== own).slice(0, max);
}

/** Asunto sin «Re:», «RV:», «Fwd:»… para comparar. */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|rv|fw|fwd|rta|resp|aw|tr)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Ordena por fecha y saca repetidos (el mismo mensaje en dos carpetas cuenta una vez). */
export function mergeThread<T extends { folder: string; uid: number; messageId: string | null; date: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeMessageId(item.messageId) ?? `${item.folder}:${item.uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}
