/**
 * Servicio Serper para búsqueda de imágenes y web.
 * Sin API key devuelve resultados mock (placeholders) para que la UI
 * no rompa en desarrollo.
 */

import { getSetting } from "@/lib/settings";

export interface SerperImage {
  url: string;
  title: string;
  source?: string;
  thumbnail?: string;
}

async function getApiKey(): Promise<string> {
  const fromDb = await getSetting("serper.api_key", "");
  return fromDb || process.env.SERPER_API_KEY || "";
}

export async function searchProductImages(query: string, count = 8): Promise<SerperImage[]> {
  return (await searchProductImagesOrError(query, count)).images;
}

/** Igual que searchProductImages, pero dice por qué no hubo resultados (sin créditos, clave inválida…). */
export async function searchProductImagesOrError(query: string, count = 8): Promise<{ images: SerperImage[]; error?: string }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { images: [], error: "No hay clave de Serper cargada (Configuración → Integraciones y claves)." };
  }

  try {
    const resp = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: count }),
      cache: "no-store",
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("Serper searchProductImages error", resp.status, body.slice(0, 200));
      if (/credits/i.test(body)) return { images: [], error: "La cuenta de Serper (buscador de imágenes) se quedó sin créditos. Hay que recargarla en serper.dev." };
      if (resp.status === 401 || resp.status === 403) return { images: [], error: "Serper rechazó la clave. Revisala en Configuración → Integraciones y claves." };
      return { images: [], error: `El buscador de imágenes respondió con error (${resp.status}). Probá de nuevo en un rato.` };
    }
    const data = (await resp.json()) as { images?: Array<{ imageUrl: string; title: string; source: string; thumbnailUrl: string }> };
    const images = (data.images || []).slice(0, count).map((i) => ({
      url: i.imageUrl,
      title: i.title,
      source: i.source,
      thumbnail: i.thumbnailUrl,
    }));
    return { images, error: images.length ? undefined : "No se encontraron imágenes. Probá con el modelo y la marca, por ejemplo «SoundTube RS500i»." };
  } catch (error) {
    console.error("Serper searchProductImages error", error);
    return { images: [], error: "No se pudo conectar con el buscador de imágenes." };
  }
}

export async function searchWeb(query: string, count = 5): Promise<Array<{ title: string; url: string; snippet?: string }>> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return Array.from({ length: count }, (_, i) => ({
      title: `Resultado mock ${i + 1} para "${query}"`,
      url: "https://example.com",
      snippet: "Resultado simulado. Configurá SERPER_API_KEY para obtener resultados reales.",
    }));
  }
  try {
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: count }),
      cache: "no-store",
    });
    if (!resp.ok) throw new Error(`Serper status ${resp.status}`);
    const data = (await resp.json()) as { organic?: Array<{ title: string; link: string; snippet: string }> };
    return (data.organic || []).slice(0, count).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  } catch (error) {
    console.error("Serper searchWeb error", error);
    return [];
  }
}
