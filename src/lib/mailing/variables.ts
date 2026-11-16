/**
 * Variables de personalización de las campañas: {{nombre}}, {{empresa}},
 * {{email}}, {{nombre_completo}} y las columnas extra de una lista importada
 * ({{ciudad}}, {{vendedor}}…). Con valor por defecto: {{nombre|colega}}.
 */

export type MailContact = {
  email: string;
  name?: string | null;
  company?: string | null;
  /** Columnas extra: { ciudad: "Rosario" }. Las claves pasan por variableKey. */
  fields?: Record<string, string> | null;
};

export const BASE_VARIABLES = [
  { key: "nombre", help: "Primer nombre" },
  { key: "nombre_completo", help: "Nombre y apellido" },
  { key: "empresa", help: "Empresa" },
  { key: "email", help: "Mail de la persona" },
] as const;

/** «Razón Social» → «razon_social»: así se escribe la variable. */
export function variableKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function valueFor(key: string, contact: MailContact): string {
  const name = (contact.name ?? "").replace(/\s+/g, " ").trim();
  switch (key) {
    case "nombre":
      return name.split(" ")[0] ?? "";
    case "nombre_completo":
      return name;
    case "empresa":
      return (contact.company ?? "").trim();
    case "email":
      return contact.email;
    default: {
      const fields = contact.fields ?? {};
      const hit = Object.entries(fields).find(([k]) => variableKey(k) === key);
      return String(hit?.[1] ?? "").trim();
    }
  }
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ ]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

/**
 * Reemplaza las variables. Si no hay dato y no hay valor por defecto queda
 * vacío, y se limpian los restos («Hola ,» → «Hola,»).
 */
export function fillVariables(text: string, contact: MailContact): string {
  if (!text.includes("{{")) return text;
  return text
    .replace(VARIABLE_RE, (_, rawKey: string, fallback: string | undefined) => valueFor(variableKey(rawKey), contact) || (fallback ?? ""))
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/\b(Hola|Buen día|Buenas tardes|Estimado|Estimada)\s*,/gi, "$1,");
}

/** Variables usadas en un texto (para avisar si alguna no existe en la lista). */
export function variablesIn(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(VARIABLE_RE)) out.add(variableKey(match[1]!));
  return [...out];
}
