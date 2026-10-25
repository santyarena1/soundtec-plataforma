import { get, put } from "@vercel/blob";

/**
 * Archivos subidos (logos, fotos de productos, planos, Excel de cotización).
 *
 * Vercel conecta el almacenamiento de dos formas: la vieja, con la clave
 * BLOB_READ_WRITE_TOKEN, y la nueva, con BLOB_STORE_ID + OIDC (el token lo
 * pone Vercel en cada pedido). Producción usa la nueva, con un almacenamiento
 * PRIVADO: los archivos no tienen URL pública y se sirven desde el propio sitio
 * por /api/files/<ruta>. Si algún día se conecta uno público, BLOB_ACCESS=public.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export const BLOB_NOT_CONFIGURED =
  "No hay almacenamiento de archivos conectado (Vercel → Storage → Blob). Mientras tanto, pegá una URL pública de la imagen.";

export const BLOB_UPLOAD_FAILED = "No se pudo guardar el archivo en el almacenamiento. Probá de nuevo; si sigue, avisame.";

export const blobAccess = (): "public" | "private" => (process.env.BLOB_ACCESS === "public" ? "public" : "private");

/** Prefijos que se pueden leer por /api/files (nada fuera de lo que sube el sistema). */
export const SERVABLE_PREFIXES = ["quotes/", "products/"] as const;

function appOrigin(): string {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "";
  return raw.replace(/\/+$/, "");
}

/**
 * Planos, imágenes de contexto y Excel de cotizaciones: solo el equipo con
 * sesión. Los logos del documento (quotes/identity) y las fotos de productos
 * son públicos: los usan el portal, el catálogo y el PDF.
 */
export function isPrivateFilePath(pathname: string): boolean {
  return pathname.startsWith("quotes/") && !pathname.startsWith("quotes/identity/");
}

/** Ruta dentro del almacenamiento si la URL es de /api/files; null si no. */
export function servedFilePath(url: string): string | null {
  const match = url.match(/\/api\/files\/(.+)$/);
  if (!match) return null;
  try {
    return match[1]!.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

/** Lee un archivo propio y lo devuelve como data: URI (para el PDF, que no tiene sesión). */
export async function servedFileAsDataUri(url: string): Promise<string | null> {
  const pathname = servedFilePath(url);
  if (!pathname || !isBlobConfigured()) return null;
  try {
    const result = await get(pathname, { access: blobAccess() });
    if (!result?.stream) return null;
    const bytes = Buffer.from(await new Response(result.stream as ReadableStream).arrayBuffer());
    return `data:${result.blob.contentType || "application/octet-stream"};base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.error("[blob] no se pudo leer", pathname, error);
    return null;
  }
}

/** URL con la que el resto del sistema (pantallas, PDF, Word) muestra un archivo privado. */
export function servedFileUrl(pathname: string): string {
  const path = pathname.split("/").map(encodeURIComponent).join("/");
  return `${appOrigin()}/api/files/${path}`;
}

/**
 * Sube un archivo y devuelve la URL para mostrarlo. El nombre lleva un sufijo
 * al azar: aunque se sirvan sin login (las fotos van al portal y al PDF), no se
 * pueden adivinar.
 */
export async function uploadFile(
  pathname: string,
  body: Buffer | Blob | ArrayBuffer,
  contentType: string,
): Promise<string> {
  const access = blobAccess();
  const data = body instanceof ArrayBuffer ? Buffer.from(body) : body;
  const blob = await put(pathname, data, { access, contentType, addRandomSuffix: true });
  return access === "public" ? blob.url : servedFileUrl(blob.pathname);
}
