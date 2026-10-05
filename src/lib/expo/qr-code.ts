import { randomInt } from "node:crypto";

/** Alfabeto sin caracteres ambiguos para leer/tipear el código. */
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const LENGTH = 7;

export function generateQrCode(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function isValidQrCode(code: string): boolean {
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c));
}
