/**
 * «A quién va» una cotización: el rubro del cliente. Elige qué versión de cada
 * texto fijo del PDF sale (presentación, instalación, cierre…).
 *
 * `focus` es lo que la IA usa para escribir una versión para ese rubro.
 */
export const QUOTE_AUDIENCES = [
  {
    key: "corporativo",
    label: "Corporativo / oficinas",
    focus: "empresas y oficinas: salas de reunión y videoconferencia, auditorios internos, uso diario por personal no técnico, continuidad operativa y soporte",
    match: ["corporativ", "oficina", "empresa", "banco", "financ"],
  },
  {
    key: "hoteleria",
    label: "Hotelería y gastronomía",
    focus: "hoteles, restaurantes y bares: música funcional por zonas, salones de eventos, estética y bajo perfil de los equipos, operación por el personal del lugar",
    match: ["hotel", "gastr", "restaur", "bar", "resto", "hospitalidad"],
  },
  {
    key: "residencial",
    label: "Residencial",
    focus: "casas y departamentos: cine en casa, audio multizona, integración discreta con la arquitectura, trato directo con el dueño o su arquitecto",
    match: ["residen", "casa", "hogar", "departam", "particular", "arquitect"],
  },
  {
    key: "educacion_gobierno",
    label: "Educación y gobierno",
    focus: "escuelas, universidades y organismos públicos: aulas y auditorios, durabilidad, documentación técnica completa y cumplimiento de pliegos",
    match: ["educ", "escuel", "universid", "colegio", "gobierno", "municip", "public", "licitac"],
  },
  {
    key: "salud",
    label: "Salud",
    focus: "clínicas y hospitales: voceo y señalización sonora, salas de capacitación, instalación con mínima interrupción de la actividad",
    match: ["salud", "clinic", "sanator", "medic", "hospital"],
  },
  {
    key: "retail",
    label: "Retail y comercios",
    focus: "locales y shoppings: música ambiental y mensajes por zona, cartelería digital, varios locales con la misma configuración",
    match: ["retail", "comerc", "local", "tienda", "shopping"],
  },
  {
    key: "integrador",
    label: "Integradores / revendedores",
    focus: "integradores y revendedores del rubro: lenguaje técnico directo, foco en disponibilidad, respaldo de marca y soporte de preventa, sin explicar lo básico",
    match: ["integrad", "revend", "distrib", "instalador"],
  },
] as const;

export type QuoteAudienceKey = (typeof QUOTE_AUDIENCES)[number]["key"];

export function isQuoteAudience(value: string | null | undefined): value is QuoteAudienceKey {
  return QUOTE_AUDIENCES.some((a) => a.key === value);
}

export function audienceLabel(key: string | null | undefined): string | null {
  return QUOTE_AUDIENCES.find((a) => a.key === key)?.label ?? null;
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Rubro sugerido a partir del «segmento» de la ficha del cliente (texto libre). */
export function audienceFromSegment(segment: string | null | undefined): QuoteAudienceKey | null {
  const text = fold(segment ?? "").trim();
  if (!text) return null;
  const exact = QUOTE_AUDIENCES.find((a) => a.key === text || fold(a.label) === text);
  if (exact) return exact.key;
  return QUOTE_AUDIENCES.find((a) => a.match.some((m) => text.includes(m)))?.key ?? null;
}
