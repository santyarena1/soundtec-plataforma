/** Hosts de los enlaces cortos que da Google Maps al «Compartir». */
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 5000;

function isGoogleHost(hostname: string): boolean {
  return /(^|\.)google\.[a-z.]+$/i.test(hostname);
}

/**
 * Convierte un enlace corto de Google Maps (maps.app.goo.gl/…) en el enlace
 * largo, que trae el lugar y las coordenadas para mostrar el mapa. Solo sigue
 * redirecciones hacia dominios de Google; cualquier otra cosa se devuelve igual.
 */
export async function resolveMapsLink(input: string | undefined | null): Promise<string | undefined> {
  const q = (input ?? "").trim();
  if (!/^https?:\/\//i.test(q)) return undefined;
  let current: URL;
  try {
    current = new URL(q);
  } catch {
    return undefined;
  }
  if (!SHORT_HOSTS.has(current.hostname)) return undefined;
  try {
    for (let i = 0; i < MAX_REDIRECTS; i++) {
      const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "Mozilla/5.0" } });
      const location = res.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      if (!SHORT_HOSTS.has(next.hostname) && !isGoogleHost(next.hostname)) break;
      current = next;
      if (isGoogleHost(current.hostname)) return current.toString();
    }
  } catch (error) {
    console.error("[forms] No se pudo resolver el enlace de Google Maps", error);
  }
  return undefined;
}
