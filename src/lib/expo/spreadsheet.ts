const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Evita la inyección de fórmulas al abrir el Excel (CSV/XLSX injection):
 * si el texto arranca con = + - @ tab o CR, se antepone un apóstrofo.
 */
export function sanitizeSpreadsheetCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}
