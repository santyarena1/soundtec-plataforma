import { prisma } from "@/lib/prisma";
import { toChangelogView, type ChangelogEntryView } from "@/lib/changelog";

export const BOOTSTRAP_CHANGELOG_ID = "changelog-bootstrap-v1";

export async function ensureBootstrapChangelog() {
  try {
    const count = await prisma.adminChangelog.count();
    if (count > 0) return;
    await prisma.adminChangelog.create({
      data: {
        id: BOOTSTRAP_CHANGELOG_ID,
        version: "1.0",
        releasedAt: new Date(),
        summary:
          "El admin ahora avisa las novedades con un changelog. Además, en márgenes y descuentos una regla puede cubrir varias marcas o clientes y se edita una subregla o el grupo entero.",
        isPublished: true,
        items: [
          {
            kind: "NUEVO",
            text: "Changelog interno: historial de versiones, botón arriba del dólar, y un popup la primera vez que hay algo nuevo.",
          },
          {
            kind: "NUEVO",
            text: "Reglas de precio agrupadas: tildás varias marcas o clientes y queda 1 regla con subreglas. Editar esta / Editar todo.",
          },
          {
            kind: "MEJORA",
            text: "Markup se carga tal cual: 2,75 = costo × 2,75. No se suma 1.",
          },
        ],
      },
    });
  } catch {
    // Tabla todavía no existe, o dos requests coincidieron al crearla.
  }
}

export async function listAllChangelogs(): Promise<ChangelogEntryView[]> {
  await ensureBootstrapChangelog();
  const rows = await prisma.adminChangelog.findMany({
    orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toChangelogView);
}

export async function getUnreadChangelogsForUser(userId: string): Promise<ChangelogEntryView[]> {
  if (!userId) return [];
  await ensureBootstrapChangelog();
  try {
    const read = await prisma.adminChangelogRead.findMany({
      where: { userId },
      select: { changelogId: true },
    });
    const seen = new Set(read.map((row) => row.changelogId));
    const rows = await prisma.adminChangelog.findMany({
      where: { isPublished: true },
      orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.filter((row) => !seen.has(row.id)).map(toChangelogView);
  } catch {
    return [];
  }
}
