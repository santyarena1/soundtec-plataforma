/**
 * Claves: generador de claves temporales y reglas mínimas para las que elige
 * el usuario. Solo servidor (usa crypto de Node).
 */

import { randomInt } from "node:crypto";

/**
 * Palabras cortas y fáciles de dictar por teléfono o WhatsApp, sin tildes ni
 * eñes (se tipean igual en cualquier teclado) y sin letras que se confunden.
 */
const WORDS = [
  "arco", "bahia", "barco", "bosque", "brisa", "cabo", "calma", "campo", "canal", "cedro", "cielo", "cima",
  "cobre", "coral", "costa", "cumbre", "delta", "duna", "faro", "fuego", "gaviota", "glaciar", "granito", "hielo",
  "isla", "jade", "lago", "lava", "lima", "lirio", "luna", "malva", "mango", "marea", "menta", "monte",
  "nube", "olivo", "onda", "oro", "palma", "pampa", "perla", "pino", "plata", "playa", "puerto", "quebrada",
  "rayo", "rio", "roble", "roca", "salvia", "selva", "sierra", "sol", "tango", "tierra", "trigo", "valle",
  "viento", "volcan", "zafiro", "zorzal", "acacia", "aurora", "bambu", "brote", "ceibo", "cometa", "cristal", "estrella",
  "fresno", "hoja", "jazmin", "laurel", "nogal", "orquidea", "pradera", "quinoa", "ruta", "sauce", "tilo", "trueno",
  "andes", "ancla", "boya", "brujula", "canoa", "dique", "estela", "fiordo", "laguna", "mareo", "molino", "muelle",
  "oasis", "pinar", "remo", "riel", "sendero", "timon", "torre", "vela", "acero", "bronce", "cuarzo", "ambar",
  "carbon", "hierro", "mineral", "opalo", "rubi", "topacio", "turquesa", "zinc", "alba", "ocaso", "pulso", "ritmo",
];

const SYMBOLS = "!#$%*+?";

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * Clave temporal fuerte y legible: cuatro palabras, cuatro dígitos y un símbolo
 * ("Faro-Cedro-Lago-Pino-4821!"). ~44 bits de azar con crypto (no Math.random);
 * además vence en el primer ingreso (hay que elegir una propia).
 * Siempre se genera en el servidor: nunca sale de un campo del formulario que
 * el navegador pueda autocompletar con la clave de quien la está creando.
 */
export function generateTemporaryPassword(): string {
  const words = Array.from({ length: 4 }, () => capitalize(WORDS[randomInt(WORDS.length)]!));
  const digits = String(randomInt(10_000)).padStart(4, "0");
  const symbol = SYMBOLS[randomInt(SYMBOLS.length)]!;
  return `${words.join("-")}-${digits}${symbol}`;
}

export const MIN_PASSWORD_LENGTH = 10;

const COMMON = new Set(["password", "contraseña", "contrasena", "12345678", "123456789", "1234567890", "qwerty123", "soundtec", "soundtec123", "admin123", "portal123"]);

/**
 * Reglas mínimas para una clave elegida por el usuario. Devuelve el motivo
 * del rechazo o null si está bien.
 */
export function passwordProblem(password: string, context?: { email?: string | null; name?: string | null }): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > 128) return "Es demasiado larga (máximo 128 caracteres).";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Tiene que combinar letras y números.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Es demasiado común. Elegí otra.";
  const local = context?.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "No puede contener tu email.";
  if (/^(.)\1+$/.test(password)) return "No puede ser un solo carácter repetido.";
  return null;
}
