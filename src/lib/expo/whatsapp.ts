/**
 * Normaliza un teléfono al formato que espera wa.me (solo dígitos, con país).
 * Pensado para Argentina y deliberadamente simple:
 * - saca todo lo que no sea dígito y el prefijo internacional 00;
 * - 549… queda igual; 54… sin 9 → se inserta el 9 de móvil;
 * - 0… (larga distancia) → se saca el 0;
 * - 10 dígitos (área + número, sin país) → se antepone 549.
 * No intenta quitar el "15" de móvil después del código de área: si viene,
 * el link puede no funcionar y el admin copia el link a mano.
 */
export function toWhatsAppNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `549${digits}`;
  return digits;
}
