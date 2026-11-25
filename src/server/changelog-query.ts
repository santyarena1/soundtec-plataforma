import { SHIPPED_ADMIN_CHANGELOG } from "@/data/admin-changelog";
import { toChangelogView, type ChangelogEntryView, type ChangelogIndexEntry } from "@/lib/changelog";

/**
 * Novedades del panel. Salen del repo (src/data/admin-changelog.ts), no de la base:
 * la tabla AdminChangelog la sincroniza el build (scripts/sync-changelog.ts).
 * Antes se sincronizaba también en el primer pedido de cada servidor: ~300 upserts
 * seguidos en cada arranque en frío que demoraban la primera pantalla del admin.
 */
let views: ChangelogEntryView[] | null = null;

function shippedViews(): ChangelogEntryView[] {
  if (!views) {
    views = [...SHIPPED_ADMIN_CHANGELOG]
      .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))
      .map((entry) =>
        toChangelogView({
          id: entry.id,
          version: entry.version,
          releasedAt: new Date(entry.releasedAt),
          summary: entry.summary,
          isPublished: true,
          items: entry.items,
        })
      );
  }
  return views;
}

/** Todas las entradas completas (pantalla Changelog). */
export async function listAllChangelogs(): Promise<ChangelogEntryView[]> {
  return shippedViews();
}

/**
 * Índice liviano para el menú y el aviso de novedades: id, versión y fecha.
 * El texto completo (~250 KB) ya no viaja en cada pantalla del admin.
 */
export function listChangelogIndex(): ChangelogIndexEntry[] {
  return shippedViews().map(({ id, version, releasedAt }) => ({ id, version, releasedAt }));
}

/** Entradas completas de los ids pedidos, de la más nueva a la más vieja. */
export function changelogEntriesByIds(ids: readonly string[]): ChangelogEntryView[] {
  const wanted = new Set(ids);
  return shippedViews().filter((entry) => wanted.has(entry.id));
}
