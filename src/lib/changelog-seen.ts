import type { ChangelogEntryView } from "@/lib/changelog";

export const CHANGELOG_SEEN_KEY = "soundtec.admin.changelog.seen";
export const CHANGELOG_SEEN_EVENT = "soundtec-changelog-seen";

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readSeenChangelogIds(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(CHANGELOG_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function unreadChangelogEntries(entries: ChangelogEntryView[]): ChangelogEntryView[] {
  const seen = new Set(readSeenChangelogIds());
  return entries.filter((entry) => !seen.has(entry.id));
}

export function markChangelogIdsSeen(ids: string[]) {
  if (!canUseStorage()) return;
  const next = [...new Set([...readSeenChangelogIds(), ...ids.filter(Boolean)])];
  try {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  window.dispatchEvent(new Event(CHANGELOG_SEEN_EVENT));
}
