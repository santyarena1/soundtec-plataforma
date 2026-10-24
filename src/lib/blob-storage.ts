/**
 * ¿Hay dónde subir archivos (Vercel Blob)?
 *
 * Vercel conecta el almacenamiento de dos formas: la vieja, con la clave
 * BLOB_READ_WRITE_TOKEN, y la nueva, con BLOB_STORE_ID + OIDC (el token lo
 * pone Vercel en cada pedido). Producción usa la nueva: exigir solo la clave
 * vieja hacía decir «no configurado» a todas las subidas.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export const BLOB_NOT_CONFIGURED =
  "No hay almacenamiento de archivos conectado (Vercel → Storage → Blob). Mientras tanto, pegá una URL pública de la imagen.";
