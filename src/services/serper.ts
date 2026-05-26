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
  const apiKey = await getApiKey();
  if (!apiKey) {
    return Array.from({ length: count }, (_, i) => ({
      url: `https://placehold.co/800x600/1e3553/ffffff/png?text=${encodeURIComponent(query)}+${i + 1}`,
      title: `${query} (mock ${i + 1})`,
      thumbnail: `https://placehold.co/200x150/1e3553/ffffff/png?text=${encodeURIComponent(query)}`,
    }));
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
    if (!resp.ok) throw new Error(`Serper status ${resp.status}`);
    const data = (await resp.json()) as { images?: Array<{ imageUrl: string; title: string; source: string; thumbnailUrl: string }> };
    return (data.images || []).slice(0, count).map((i) => ({
      url: i.imageUrl,
      title: i.title,
      source: i.source,
      thumbnail: i.thumbnailUrl,
    }));
  } catch (error) {
    console.error("Serper searchProductImages error", error);
    return [];
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
