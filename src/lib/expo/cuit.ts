/** CUIT argentino: normalización y dígito verificador (módulo 11). */

const PREFIXES = new Set(["20", "23", "24", "27", "30", "33", "34"]);
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizeCuit(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCuit(raw: string): boolean {
  const cuit = normalizeCuit(raw);
  if (cuit.length !== 11 || !PREFIXES.has(cuit.slice(0, 2))) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(cuit[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(cuit[10]);
}

export function formatCuit(raw: string): string {
  const c = normalizeCuit(raw);
  return c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : raw;
}
