import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Cifrado de las claves guardadas en la base (OpenAI, Anthropic, Serper,
 * claves de portales de proveedores…). AES-256-GCM con ENCRYPTION_KEY, que vive
 * solo en las variables de Vercel: si alguien obtiene una copia de la base, no
 * obtiene las claves.
 *
 * Formato: enc:v1:<iv>:<tag>:<texto cifrado> (base64url).
 */
const PREFIX = "enc:v1:";

function keyFrom(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  // Se acepta cualquier texto largo: se deriva a 32 bytes.
  return createHash("sha256").update(value).digest();
}

export const isEncrypted = (value: string | null | undefined): boolean => Boolean(value?.startsWith(PREFIX));

export function encryptionAvailable(secret = process.env.ENCRYPTION_KEY): boolean {
  return Boolean(keyFrom(secret));
}

export function encryptSecret(plain: string, secret = process.env.ENCRYPTION_KEY): string {
  const key = keyFrom(secret);
  if (!key || !plain || isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${data.toString("base64url")}`;
}

/** Devuelve el texto plano; si no se puede descifrar (falta la clave o cambió), "" — nunca el valor cifrado. */
export function decryptSecret(value: string, secret = process.env.ENCRYPTION_KEY): string {
  if (!isEncrypted(value)) return value;
  const key = keyFrom(secret);
  if (!key) return "";
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv!, "base64url"));
    decipher.setAuthTag(Buffer.from(tag!, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data!, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** «sk-…a1b2»: para mostrar que una clave está cargada sin mostrarla. */
export function maskForDisplay(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 3)}…${plain.slice(-4)}`;
}
