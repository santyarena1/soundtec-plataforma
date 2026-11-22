/**
 * Trae una foto de producto de afuera (resultado de Serper o URL pegada), la
 * valida por contenido, la normaliza y la guarda en nuestro almacenamiento
 * (Blob), así no depende de que el sitio del fabricante siga arriba ni de que
 * permita mostrarla desde otro dominio.
 */
import { slugify } from "@/lib/utils";
import { isBlobConfigured, uploadFile } from "@/lib/blob-storage";
import { checkRemoteImageUrl, isRawSerperImage, refererFor } from "@/lib/remote-image/url-guard";
import { ImageRejectError, rejectMessage, type ImageRejectReason } from "@/lib/remote-image/reasons";
import { downloadRemoteImage, findPageImage } from "./download";
import { normalizeProductImage, type NormalizedImage } from "./normalize";

export interface RemoteImageCandidate {
  url: string;
  /** Página donde Google encontró la foto (Referer y og:image). */
  pageUrl?: string | null;
  /** Miniatura de Google: último recurso si la original no se puede bajar. */
  thumbnail?: string | null;
}

export interface FetchedImage {
  image: NormalizedImage;
  sourceUrl: string;
  /** "thumbnail" u "og:image" cuando la original no sirvió. */
  via: "original" | "og:image" | "thumbnail";
}

export type FetchOutcome = { ok: true; fetched: FetchedImage } | { ok: false; reason: ImageRejectReason; message: string };

async function tryOne(url: string, referer: string | null): Promise<NormalizedImage> {
  const downloaded = await downloadRemoteImage(url, { referer });
  return normalizeProductImage(downloaded.bytes);
}

/** Prueba la original, después og:image (si Google no dio dirección) y la miniatura. */
export async function fetchCandidateImage(candidate: RemoteImageCandidate): Promise<FetchOutcome> {
  const attempts: Array<{ url: string; via: FetchedImage["via"] }> = [];
  const raw = isRawSerperImage(candidate.url);
  if (!raw) attempts.push({ url: candidate.url, via: "original" });
  if (raw && candidate.pageUrl) {
    const og = await findPageImage(candidate.pageUrl);
    if (og) attempts.push({ url: og, via: "og:image" });
  }
  if (candidate.thumbnail && candidate.thumbnail !== candidate.url) attempts.push({ url: candidate.thumbnail, via: "thumbnail" });

  let first: ImageRejectError | null = raw ? new ImageRejectError("unsupported-scheme", "Google no da la dirección de esta foto") : null;
  for (const attempt of attempts) {
    const checked = checkRemoteImageUrl(attempt.url);
    if (!checked.ok) {
      first ??= new ImageRejectError(checked.reason);
      continue;
    }
    try {
      const image = await tryOne(attempt.url, refererFor(checked.url, candidate.pageUrl));
      return { ok: true, fetched: { image, sourceUrl: attempt.url, via: attempt.via } };
    } catch (error) {
      const err = error instanceof ImageRejectError ? error : new ImageRejectError("network");
      first ??= err;
      // Lo que bloquea la seguridad no se reintenta con otra dirección.
      if (err.reason === "private-host") break;
    }
  }
  const final = first ?? new ImageRejectError("invalid-url");
  return { ok: false, reason: final.reason, message: final.message };
}

export type StoreOutcome =
  | { ok: true; url: string; stored: "blob" | "external"; via: FetchedImage["via"]; converted: boolean }
  | { ok: false; reason: ImageRejectReason | "storage"; message: string };

/** Sube la foto ya normalizada a products/<id>/… y devuelve la URL para guardar en la base. */
export async function storeNormalizedImage(productId: string, image: NormalizedImage, baseName: string): Promise<string> {
  const slug = slugify(baseName).slice(0, 60) || "imagen";
  return uploadFile(`products/${productId}/${Date.now()}-${slug}.${image.ext}`, image.bytes, image.contentType);
}

export async function importRemoteProductImage(productId: string, candidate: RemoteImageCandidate, baseName: string): Promise<StoreOutcome> {
  const outcome = await fetchCandidateImage(candidate);
  if (!outcome.ok) return outcome;
  const { image, sourceUrl, via } = outcome.fetched;

  if (isBlobConfigured()) {
    try {
      const url = await storeNormalizedImage(productId, image, baseName);
      return { ok: true, url, stored: "blob", via, converted: image.converted };
    } catch (error) {
      console.error("[product-image] no se pudo guardar en Blob", sourceUrl, error);
      return { ok: false, reason: "storage", message: "No se pudo guardar la imagen en el almacenamiento. Probá de nuevo." };
    }
  }
  // Sin almacenamiento (desarrollo local): solo se puede enlazar la original si ya se ve en el navegador.
  if (!image.converted && sourceUrl.startsWith("https://")) {
    return { ok: true, url: sourceUrl, stored: "external", via, converted: false };
  }
  return {
    ok: false,
    reason: "storage",
    message: `Esta imagen hay que convertirla (${image.sourceFormat.toUpperCase()}) y no hay almacenamiento de archivos conectado.`,
  };
}

export { rejectMessage };
