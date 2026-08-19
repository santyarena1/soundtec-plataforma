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
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
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
