/**
 * Validación de direcciones de imágenes que el servidor va a descargar
 * (protección SSRF): solo http/https, sin usuario:clave, sin puertos raros y
 * nunca hacia la red interna (localhost, 10.x, 192.168.x, metadatos de la nube…).
 * El chequeo de IP se repite después de resolver el DNS, en la descarga.
 */
import { isIP } from "node:net";
import type { ImageRejectReason } from "./reasons";

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: ImageRejectReason };

const ALLOWED_PORTS = new Set(["", "80", "443"]);
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet"];

export function checkRemoteImageUrl(raw: string): UrlCheck {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, reason: "invalid-url" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "unsupported-scheme" };
  if (url.username || url.password) return { ok: false, reason: "invalid-url" };
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, reason: "private-host" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { ok: false, reason: "invalid-url" };
  if (host === "localhost" || INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "private-host" };
  if (isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, reason: "private-host" };
  } else if (!host.includes(".")) {
    // Nombres sin dominio («intranet», «metadata») solo resuelven en redes internas.
    return { ok: false, reason: "private-host" };
  } else if (/^[\d.]+$/.test(host) || /^0x/i.test(host)) {
    // Formas raras de escribir una IP (octal, hex): no se aceptan.
    return { ok: false, reason: "private-host" };
  }
  return { ok: true, url };
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], // «esta red»
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local / metadatos de la nube
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservado + broadcast
];

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/** IP privada, local, reservada o de metadatos (IPv4 e IPv6, incluido ::ffff:a.b.c.d). */
export function isPrivateIp(ip: string): boolean {
  const value = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const kind = isIP(value);
  if (kind === 4) return isPrivateV4(value);
  if (kind !== 6) return true; // lo que no se entiende, se bloquea
  if (value === "::" || value === "::1") return true;
  const mapped = value.match(/^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]!);
  const mappedHex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16);
    const lo = parseInt(mappedHex[2]!, 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(value.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 únicas locales
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (value.startsWith("64:ff9b:")) return true; // NAT64 (puede apuntar a IPv4 internas)
  if (value.startsWith("2001:db8:")) return true; // documentación
  return false;
}

/**
 * Serper a veces devuelve «x-raw-image:///…» (la foto venía incrustada en la
 * página y Google no da la dirección real). En ese caso la mejor opción es la
 * miniatura de Google o la imagen principal (og:image) de la página de origen.
 */
export function isRawSerperImage(url: string | null | undefined): boolean {
  return /^x-raw-image:/i.test((url ?? "").trim());
}

/** Referer para la descarga: el sitio donde Google encontró la foto, o el de la propia imagen. */
export function refererFor(imageUrl: URL, pageUrl?: string | null): string {
  const page = pageUrl ? checkRemoteImageUrl(pageUrl) : null;
  if (page?.ok) return `${page.url.origin}/`;
  return `${imageUrl.origin}/`;
}
