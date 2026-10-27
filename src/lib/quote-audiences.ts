/**
 * «A quién va» una cotización (el rubro del cliente). Las opciones las crea cada
 * uno en Configuración (tabla QuoteAudience). Estos eran los rubros fijos de
 * antes: solo se usan para no perder los que ya estén en uso (textos, tipos o
 * cotizaciones que los nombran) y como texto para la IA si no tienen otro.
 */
export const LEGACY_QUOTE_AUDIENCES = [
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

/** Una opción de «A quién va» tal como la usan las pantallas. */
export type QuoteAudienceOption = { key: string; label: string; focus?: string | null };

export function legacyAudience(key: string | null | undefined) {
  return LEGACY_QUOTE_AUDIENCES.find((a) => a.key === key) ?? null;
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Rubro sugerido a partir del «segmento» de la ficha del cliente (texto libre),
 * entre las opciones creadas: por clave, por nombre o porque el nombre aparece en el segmento.
 */
export function audienceFromSegment(segment: string | null | undefined, options: QuoteAudienceOption[]): string | null {
  const text = fold(segment ?? "").trim();
  if (!text || !options.length) return null;
  const exact = options.find((a) => a.key === text || fold(a.label) === text);
  if (exact) return exact.key;
  return (
    options.find((a) => {
      const words = fold(a.label).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
      return words.some((w) => text.includes(w.slice(0, 6)));
    })?.key ?? null
  );
}
