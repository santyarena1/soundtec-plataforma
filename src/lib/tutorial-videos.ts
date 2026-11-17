import { z } from "zod";

/**
 * Videos tutoriales del portal (/portal/tutoriales).
 *
 * La lista vive en el AdminSetting «portal.tutorial_videos» (JSON). La carga
 * scripts/tutorial-videos-upload.ts a partir de la carpeta de videos y su
 * videos.md; los títulos y descripciones se pueden corregir después en el
 * setting y el script los respeta al volver a correr (salvo --reset-texts).
 */
export const TUTORIAL_VIDEOS_SETTING = "portal.tutorial_videos";

const videoSchema = z.object({
  slug: z.string().min(1),
  order: z.number().int(),
  title: z.string().min(1),
  description: z.string().default(""),
  durationSeconds: z.number().int().nonnegative(),
  videoUrl: z.string().min(1),
  posterUrl: z.string().default(""),
});

export type TutorialVideo = z.infer<typeof videoSchema>;

/** Lee el JSON del setting. Lo que no cumple el formato se descarta (nunca rompe la página). */
export function parseTutorialVideos(raw: string | null | undefined): TutorialVideo[] {
  if (!raw?.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : (data as { videos?: unknown })?.videos;
  if (!Array.isArray(list)) return [];
  const videos: TutorialVideo[] = [];
  for (const item of list) {
    const parsed = videoSchema.safeParse(item);
    if (parsed.success) videos.push(parsed.data);
  }
  return videos.sort((a, b) => a.order - b.order);
}

/** 107 → «1:47». */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** «1:47» → 107; null si no se entiende. */
export function parseDuration(text: string): number | null {
  const m = text.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export type TutorialVideoSource = {
  slug: string;
  order: number;
  title: string;
  description: string;
  durationSeconds: number;
  videoFile: string;
  posterFile: string | null;
};

/**
 * Saca de videos.md cada video: número, título, archivo, miniatura, duración y
 * la línea de la «Placa de título» (lo que va después de la raya) como descripción.
 */
export function parseVideosMarkdown(markdown: string): TutorialVideoSource[] {
  const sections = markdown.split(/^##\s+/m).slice(1);
  const out: TutorialVideoSource[] = [];
  for (const section of sections) {
    const heading = section.split(/\r?\n/, 1)[0]!.trim();
    const headingMatch = heading.match(/^(\d+)\s*[·.\-–—]\s*(.+)$/);
    const fileMatch = section.match(/Archivo:\s*`([^`]+\.mp4)`/i);
    if (!headingMatch || !fileMatch) continue;
    const posterMatch = section.match(/miniatura\s*`([^`]+\.(?:jpe?g|png|webp))`/i);
    const durationMatch = section.match(/Duraci[oó]n:\s*(\d+:\d{2})/i);
    const plate = section.match(/\*\*Placa de t[ií]tulo:\*\*\s*(.+)/i)?.[1]?.trim() ?? "";
    const plateParts = plate.split(/\s+[—–-]\s+/);
    const description = plateParts.length > 1 ? plateParts.slice(1).join(" — ").trim() : "";
    const videoFile = fileMatch[1]!;
    out.push({
      slug: videoFile.replace(/\.mp4$/i, ""),
      order: Number(headingMatch[1]),
      title: headingMatch[2]!.trim(),
      description,
      durationSeconds: durationMatch ? parseDuration(durationMatch[1]!) ?? 0 : 0,
      videoFile,
      posterFile: posterMatch?.[1] ?? null,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * Arma la lista nueva: archivos y duración salen siempre de la carpeta; los
 * textos ya cargados en el setting se conservan (alguien pudo corregirlos)
 * salvo que se pida resetearlos.
 */
export function mergeTutorialVideos(
  sources: Array<TutorialVideoSource & { videoUrl: string; posterUrl: string }>,
  previous: TutorialVideo[],
  options: { resetTexts?: boolean } = {},
): TutorialVideo[] {
  const bySlug = new Map(previous.map((v) => [v.slug, v]));
  return sources.map((s) => {
    const prev = options.resetTexts ? undefined : bySlug.get(s.slug);
    return {
      slug: s.slug,
      order: s.order,
      title: prev?.title || s.title,
      description: prev?.description || s.description,
      durationSeconds: s.durationSeconds,
      videoUrl: s.videoUrl,
      posterUrl: s.posterUrl,
    };
  });
}
