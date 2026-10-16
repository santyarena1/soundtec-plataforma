/**
 * Modo "Catálogo sin precios": el vendedor le muestra el portal a un cliente
 * (en su celular o notebook) sin revelar ningún precio, stock ni condiciones.
 * Vive en una cookie de este navegador; mientras está activo el portal se ve
 * como el catálogo público y para salir hay que confirmar con la clave.
 */

import { cookies } from "next/headers";

export const CATALOG_MODE_COOKIE = "st_catalogo";
/** Dura una jornada: si el vendedor se olvida de salir, al día siguiente vuelve solo. */
export const CATALOG_MODE_MAX_AGE = 12 * 60 * 60;

export function isCatalogModeOn(): boolean {
  return cookies().get(CATALOG_MODE_COOKIE)?.value === "1";
}
