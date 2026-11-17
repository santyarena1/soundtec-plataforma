/**
 * Datos de contacto de Soundtec. Una sola fuente para la web, el portal, las
 * cotizaciones y las láminas: antes convivían "(+ 54 11) 4586 0400" y
 * "(+54 11) 4586-0400".
 */
export const SOUNDTEC_PHONE = "+54 11 4586-0400";
export const SOUNDTEC_PHONE_HREF = "tel:+541145860400";

const SOUNDTEC_PHONE_DIGITS = "541145860400";

/**
 * Si el teléfono guardado en Configuración es el de Soundtec escrito de otra
 * forma, se muestra con el formato único. Otro número se respeta tal cual.
 */
export function displayCompanyPhone(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return SOUNDTEC_PHONE;
  const digits = text.replace(/\D/g, "");
  if (digits === SOUNDTEC_PHONE_DIGITS || digits === SOUNDTEC_PHONE_DIGITS.slice(2)) return SOUNDTEC_PHONE;
  return text;
}
