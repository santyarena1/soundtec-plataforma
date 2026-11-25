/**
 * Videos de la galería del producto: links de YouTube o Instagram.
 *
 * Se guarda el id del video y un link canónico armado por nosotros; nunca el
 * texto que pegó el usuario tal cual. Así el reproductor siempre se arma con
 * un dominio conocido (youtube-nocookie / instagram) y un id validado.
 */

export type VideoProvider = "youtube" | "instagram";

export interface NormalizedVideo {
  provider: VideoProvider;
  videoId: string;
  /** Link para abrir el video en su plataforma. */
  url: string;
}

export type VideoParseResult = ({ ok: true } & NormalizedVideo) | { ok: false; error: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const INSTAGRAM_ID = /^[A-Za-z0-9_-]{5,40}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const INSTAGRAM_KINDS = new Set(["p", "reel", "reels", "tv"]);

const NOT_SUPPORTED = "Pegá un link de YouTube (youtube.com/watch, youtu.be, shorts) o de Instagram (post, reel o tv).";

function parseUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text || text.length > 500) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function youtubeIdFrom(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" || host === "www.youtu.be") return parts[0] ?? null;
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (parts[0] === "watch") return url.searchParams.get("v");
  if (parts.length === 0) return url.searchParams.get("v");
  if (["shorts", "embed", "live", "v"].includes(parts[0]!)) return parts[1] ?? null;
  return null;
}

function instagramIdFrom(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!INSTAGRAM_HOSTS.has(host)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // instagram.com/p/ID, /reel/ID, /tv/ID y también instagram.com/usuario/reel/ID.
  const kindIndex = parts.findIndex((part) => INSTAGRAM_KINDS.has(part.toLowerCase()));
  if (kindIndex < 0 || kindIndex > 1) return null;
  return parts[kindIndex + 1] ?? null;
}

/** Valida un link pegado y lo lleva a la forma canónica. */
export function normalizeVideoUrl(raw: string): VideoParseResult {
  const url = parseUrl(raw);
  if (!url) return { ok: false, error: NOT_SUPPORTED };

  const host = url.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be" || YOUTUBE_HOSTS.has(host)) {
    const id = youtubeIdFrom(url);
    if (!id || !YOUTUBE_ID.test(id)) return { ok: false, error: "Ese link de YouTube no tiene un video reconocible." };
    return { ok: true, provider: "youtube", videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }
  if (INSTAGRAM_HOSTS.has(host)) {
    const id = instagramIdFrom(url);
    if (!id || !INSTAGRAM_ID.test(id)) return { ok: false, error: "Ese link de Instagram no es de un post, reel o tv." };
    return { ok: true, provider: "instagram", videoId: id, url: `https://www.instagram.com/p/${id}/` };
  }
  return { ok: false, error: NOT_SUPPORTED };
}

/** Reproductor embebido. YouTube va por youtube-nocookie: no deja cookies hasta que se reproduce. */
export function videoEmbedUrl(video: { provider: string; videoId: string }): string | null {
  if (video.provider === "youtube" && YOUTUBE_ID.test(video.videoId)) {
    return `https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0`;
  }
  if (video.provider === "instagram" && INSTAGRAM_ID.test(video.videoId)) {
    return `https://www.instagram.com/p/${video.videoId}/embed/`;
  }
  return null;
}

/** Miniatura estática. Instagram no ofrece una sin su API: se dibuja una tarjeta propia. */
export function videoThumbnailUrl(video: { provider: string; videoId: string }): string | null {
  if (video.provider === "youtube" && YOUTUBE_ID.test(video.videoId)) {
    return `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
  }
  return null;
}

export function videoProviderLabel(provider: string): string {
  return provider === "instagram" ? "Instagram" : "YouTube";
}
