export const CUSTOM_SECTION_TYPE = "custom";

export const QUOTE_MODULE_LAYOUTS = [
  { key: "text_only", label: "Solo texto", hint: "Sin foto en este módulo" },
  { key: "image_left", label: "Foto a la izquierda", hint: "Imagen a la izquierda, texto a la derecha" },
  { key: "image_right", label: "Foto a la derecha", hint: "Texto a la izquierda, imagen a la derecha" },
  { key: "image_above", label: "Foto arriba", hint: "La imagen va sobre el texto" },
  { key: "image_below", label: "Foto abajo", hint: "La imagen va debajo del texto" },
  { key: "images_row", label: "Dos fotos en fila", hint: "Dos imágenes una al lado de la otra" },
] as const;

export type QuoteModuleLayout = (typeof QUOTE_MODULE_LAYOUTS)[number]["key"];

export function isCustomSectionType(type: string) {
  return type === CUSTOM_SECTION_TYPE || type.startsWith("custom:");
}

export function parseQuoteModuleLayout(value: string | null | undefined): QuoteModuleLayout {
  return QUOTE_MODULE_LAYOUTS.some((item) => item.key === value)
    ? (value as QuoteModuleLayout)
    : "text_only";
}

export function quoteModuleLayoutLabel(value: string | null | undefined) {
  const key = parseQuoteModuleLayout(value);
  return QUOTE_MODULE_LAYOUTS.find((item) => item.key === key)?.label || "Solo texto";
}
