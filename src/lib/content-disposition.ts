/** Nombre de archivo de una descarga según Content-Disposition (prefiere el UTF-8, con tildes). */
export function downloadFileName(res: Response, fallback: string): string {
  const header = res.headers.get("Content-Disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // Codificación rota: se usa el nombre ASCII o el de respaldo.
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}
