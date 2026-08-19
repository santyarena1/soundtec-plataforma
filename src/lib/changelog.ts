export const CHANGELOG_KINDS = ["NUEVO", "FIX", "MEJORA"] as const;
export type ChangelogKind = (typeof CHANGELOG_KINDS)[number];

export type ChangelogItem = {
  kind: ChangelogKind;
  text: string;
};

export type ChangelogEntryView = {
  id: string;
  version: string;
  releasedAt: string;
  summary: string;
  isPublished: boolean;
  items: ChangelogItem[];
};

export const CHANGELOG_KIND_STYLE: Record<ChangelogKind, { label: string; className: string }> = {
  NUEVO: { label: "NUEVO", className: "bg-emerald-600 text-white" },
  FIX: { label: "FIX", className: "bg-orange-500 text-white" },
  MEJORA: { label: "MEJORA", className: "bg-sky-600 text-white" },
};

export function isChangelogKind(value: string): value is ChangelogKind {
  return CHANGELOG_KINDS.includes(value as ChangelogKind);
}

export function parseChangelogItems(raw: unknown): ChangelogItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ChangelogItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const kind = "kind" in row ? String((row as { kind: unknown }).kind) : "";
    const text = "text" in row ? String((row as { text: unknown }).text || "").trim() : "";
    if (!isChangelogKind(kind) || !text) continue;
    items.push({ kind, text });
  }
  return items;
}

export function displayChangelogVersion(version: string) {
  const trimmed = version.trim();
  if (!trimmed) return "v—";
  return trimmed.toLowerCase().startsWith("v") ? trimmed : `v${trimmed}`;
}

export function formatChangelogDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Agrupa varias entradas del mismo día en una sola tarjeta (un push / un día). */
export type ChangelogDayGroup = {
  key: string;
  releasedAt: string;
  summary: string;
  items: ChangelogItem[];
  sourceIds: string[];
};

export function changelogDayKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "invalid";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function groupChangelogByDay(entries: ChangelogEntryView[]): ChangelogDayGroup[] {
  const buckets = new Map<string, ChangelogEntryView[]>();
  const newestFirst = [...entries].sort(
    (a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime()
  );
  for (const entry of newestFirst) {
    const key = changelogDayKey(entry.releasedAt);
    const list = buckets.get(key) || [];
    list.push(entry);
    buckets.set(key, list);
  }
  const groups: ChangelogDayGroup[] = [];
  for (const [key, list] of buckets) {
    const seen = new Set<string>();
    const items: ChangelogItem[] = [];
    for (const entry of list) {
      for (const item of entry.items) {
        const token = `${item.kind}:${item.text}`;
        if (seen.has(token)) continue;
        seen.add(token);
        items.push(item);
      }
    }
    const newest = list[0];
    if (!newest) continue;
    groups.push({
      key,
      releasedAt: newest.releasedAt,
      summary: newest.summary,
      items,
      sourceIds: list.map((entry) => entry.id),
    });
  }
  return groups;
}

export function toChangelogView(row: {
  id: string;
  version: string;
  releasedAt: Date;
  summary: string;
  isPublished: boolean;
  items: unknown;
}): ChangelogEntryView {
  return {
    id: row.id,
    version: row.version,
    releasedAt: row.releasedAt.toISOString(),
    summary: row.summary,
    isPublished: row.isPublished,
    items: parseChangelogItems(row.items),
  };
}
