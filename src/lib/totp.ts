/**
 * Códigos de 6 dígitos que cambian cada 30 segundos (TOTP, RFC 6238), los de
 * Google Authenticator, Microsoft Authenticator, 1Password, etc.
 *
 * Web Crypto (no node:crypto): lo usa el ingreso, que también se compila para
 * el middleware.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Secreto nuevo (160 bits) en base32, para cargar en la app. */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

async function hotp(key: Uint8Array, counter: number, digits: number): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, msg));
  const offset = mac[mac.length - 1]! & 15;
  const bin = ((mac[offset]! & 127) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export async function totpCode(secretBase32: string, atMs = Date.now(), digits = DIGITS): Promise<string> {
  return hotp(base32Decode(secretBase32), Math.floor(atMs / 1000 / STEP_SECONDS), digits);
}

/** Acepta el código actual y el de 30 s antes o después (relojes desfasados). */
export async function verifyTotp(secretBase32: string, code: string, atMs = Date.now()): Promise<boolean> {
  const given = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(given) || !secretBase32) return false;
  const key = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  for (const delta of [-1, 0, 1]) {
    if ((await hotp(key, counter + delta, DIGITS)) === given) return true;
  }
  return false;
}

/** Enlace que leen las apps (el QR lo codifica). */
export function totpUri(secretBase32: string, account: string, issuer = "Soundtec"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
