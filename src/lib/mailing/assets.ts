import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { appUrl } from "@/lib/app-url";
import { BLOB_NOT_CONFIGURED, isBlobConfigured, uploadFile } from "@/lib/blob-storage";
import { analyzeEmailHtml, hostImages, MAX_TEMPLATE_BYTES, sanitizeEmailHtml, type IncomingFile, type StoreImage, type TemplateWarning } from "@/lib/mailing/html-template";

/**
 * Guarda una imagen de un mail y devuelve su URL absoluta. En producción va a
 * Blob (prefijo mailing/, servido por /api/files sin sesión). En desarrollo,
 * sin Blob configurado, queda en public/uploads/mailing-dev para poder probar.
 */
export const storeMailingImage: StoreImage = async (bytes, contentType, ext) => {
  const name = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png"}`;
  if (isBlobConfigured()) return uploadFile(`mailing/${name}`, Buffer.from(bytes), contentType);
  if (process.env.NODE_ENV === "development") {
    const dir = path.join(process.cwd(), "public", "uploads", "mailing-dev");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
    return `${appUrl()}/uploads/mailing-dev/${name}`;
  }
  throw new Error(BLOB_NOT_CONFIGURED);
};

const RISKY = /<script|<iframe|<form|<object|<embed|\son[a-z]+\s*=|javascript\s*:/i;

export type ProcessedHtml = { html: string; warnings: TemplateWarning[]; uploaded: number };

/** Lo que pasa con todo HTML que entra: saneo, imágenes a Blob y avisos. */
export async function processIncomingHtml(raw: string, options: { files?: IncomingFile[]; htmlPath?: string } = {}): Promise<ProcessedHtml> {
  if (!raw.trim()) throw new Error("El HTML está vacío.");
  if (Buffer.byteLength(raw, "utf8") > MAX_TEMPLATE_BYTES * 8) throw new Error("El HTML es demasiado grande.");
  const sanitized = sanitizeEmailHtml(raw);
  const hosted = await hostImages(sanitized, { ...options, store: storeMailingImage });
  if (Buffer.byteLength(hosted.html, "utf8") > MAX_TEMPLATE_BYTES) throw new Error("Aun con las imágenes afuera, el HTML pesa más de 600 KB: así no se puede mandar.");
  const warnings = analyzeEmailHtml(hosted.html, { removedSomething: RISKY.test(raw) });
  if (hosted.missing.length) {
    const idx = warnings.findIndex((w) => w.code === "relative_image");
    const message = `No encontré ${hosted.missing.length} imagen(es) para subir: ${hosted.missing.slice(0, 3).join(", ")}${hosted.missing.length > 3 ? "…" : ""}. Subí un .zip con el HTML y las imágenes, o usá direcciones https://.`;
    if (idx >= 0) warnings[idx] = { code: "relative_image", message };
    else warnings.unshift({ code: "relative_image", message });
  }
  return { html: hosted.html, warnings, uploaded: hosted.uploaded };
}
