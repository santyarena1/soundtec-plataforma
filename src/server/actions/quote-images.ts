"use server";

import { QuoteAiCapability, QuoteAssetKind, QuoteNodeSource } from "@prisma/client";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser } from "@/lib/quote-access";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { searchProductImages } from "@/services/serper";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { revalidatePath } from "next/cache";
import {
  catalogPrimaryImage,
  fillMissingQuoteProductImages,
  upsertQuoteProductImage,
} from "@/lib/quote-product-images";

async function storeImage(pathname: string, bytes: ArrayBuffer, contentType: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "public",
    contentType,
  });
  return blob.url;
}

export async function storeQuoteBlob(pathname: string, bytes: ArrayBuffer, contentType: string) {
  return storeImage(pathname, bytes, contentType);
}

export async function searchQuoteImages(query: string) {
  await getCurrentPermissions();
  return searchProductImages(query, 8);
}

export async function attachSerperImage(input: {
  quoteId: string;
  url: string;
  caption?: string;
  productId?: string;
  sectionId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };
  let url = input.url;
  try {
    const res = await fetch(input.url);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const stored = await storeImage(
        `quotes/${input.quoteId}/${Date.now()}.jpg`,
        buf,
        res.headers.get("content-type") || "image/jpeg"
      );
      if (stored) url = stored;
    }
  } catch {
    /* keep remote url */
  }
  if (input.productId) {
    await upsertQuoteProductImage({
      quoteId: input.quoteId,
      productId: input.productId,
      url,
      caption: input.caption,
      source: QuoteNodeSource.SUGGESTED,
    });
  } else {
    const sort = loaded.quote.assets.length;
    await prisma.quoteAsset.create({
      data: {
        quoteId: input.quoteId,
        kind: QuoteAssetKind.APPLICATION,
        url,
        caption: input.caption || "",
        aiGenerated: false,
        source: QuoteNodeSource.SUGGESTED,
        sortOrder: sort,
        sectionId: input.sectionId || null,
      },
    });
  }
  await prisma.quoteAiRun.create({
    data: {
      quoteId: input.quoteId,
      userId: loaded.user.id,
      capability: QuoteAiCapability.IMAGE_SEARCH,
      provider: "serper",
      output: { url: input.url },
      accepted: true,
    },
  });
  revalidatePath(`/admin/quotes/${input.quoteId}`);
  return { ok: true };
}

export async function generateQuoteConceptImage(input: {
  quoteId: string;
  prompt: string;
  sectionId?: string;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };

  const provider = await getSetting(QUOTE_SETTING_KEYS.imageGenProvider, "openai");
  if (provider === "higgsfield") {
    const key = await getSetting(QUOTE_SETTING_KEYS.higgsfieldKey, "");
    if (!key) return { ok: false, error: "Cargá Higgsfield API Key o cambiá el proveedor a OpenAI." };
    return {
      ok: false,
      error:
        "Higgsfield está como opción en configuración, pero el motor activo del módulo es OpenAI + Serper. Cambiá images.provider a openai.",
    };
  }

  const imageKey =
    (await getSetting(QUOTE_SETTING_KEYS.imageGenKey, "")) ||
    (await getSetting(QUOTE_SETTING_KEYS.openaiKey, process.env.OPENAI_API_KEY || ""));
  if (!imageKey) return { ok: false, error: "Cargá OpenAI API Key para generar esquemas." };
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: imageKey });

  const prompt = `Diagrama conceptual sobrio, estilo documentación de integrador audiovisual, fondo blanco, sin texto inventado de marcas, sin fotorealismo de una obra real. ${input.prompt}. Leyenda implícita: imagen conceptual.`;
  const img = await client.images.generate({
    model: "dall-e-3",
    prompt,
    size: "1024x1024",
    quality: "standard",
    n: 1,
  });
  const remote = img.data?.[0]?.url;
  if (!remote) return { ok: false, error: "OpenAI no devolvió imagen." };
  let url = remote;
  try {
    const res = await fetch(remote);
    const buf = await res.arrayBuffer();
    const stored = await storeImage(`quotes/${input.quoteId}/gen-${Date.now()}.png`, buf, "image/png");
    if (stored) url = stored;
  } catch {
    /* keep openai url */
  }
  await prisma.quoteAsset.create({
    data: {
      quoteId: input.quoteId,
      kind: QuoteAssetKind.GENERATED,
      url,
      caption: "Imagen conceptual",
      aiGenerated: true,
      source: QuoteNodeSource.GENERATED,
      sortOrder: loaded.quote.assets.length,
      sectionId: input.sectionId || null,
    },
  });
  await prisma.quoteAiRun.create({
    data: {
      quoteId: input.quoteId,
      userId: loaded.user.id,
      capability: QuoteAiCapability.IMAGE_GENERATE,
      provider: "openai",
      instruction: input.prompt,
      accepted: true,
    },
  });
  revalidatePath(`/admin/quotes/${input.quoteId}`);
  return { ok: true, message: "Imagen conceptual agregada (queda etiquetada, no como foto de obra)." };
}

export async function attachQuotePlan(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const quoteId = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };
  const file = formData.get("file");
  const urlField = String(formData.get("url") || "").trim();
  let url = urlField;
  if (file instanceof File && file.size > 0) {
    const buf = await file.arrayBuffer();
    const stored = await storeImage(
      `quotes/${quoteId}/plan-${Date.now()}-${file.name}`,
      buf,
      file.type || "application/octet-stream"
    );
    if (!stored) {
      return {
        ok: false,
        error: "Para subir planos hace falta BLOB_READ_WRITE_TOKEN en el entorno. Pegá una URL pública mientras tanto.",
      };
    }
    url = stored;
  }
  if (!url) return { ok: false, error: "Subí un archivo o pegá una URL." };
  await prisma.quoteAsset.create({
    data: {
      quoteId,
      kind: QuoteAssetKind.PLAN,
      url,
      caption: String(formData.get("caption") || "Plano / foto de obra"),
      aiGenerated: false,
      source: QuoteNodeSource.MANUAL,
      sortOrder: loaded.quote.assets.length,
    },
  });
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

export async function deleteQuoteAsset(formData: FormData): Promise<void> {
  const id = String(formData.get("assetId") || "");
  const asset = await prisma.quoteAsset.findUnique({ where: { id } });
  if (!asset || asset.locked) return;
  const loaded = await loadQuoteForUser(asset.quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  await prisma.quoteAsset.delete({ where: { id } });
  revalidatePath(`/admin/quotes/${asset.quoteId}`);
}

export async function fillQuoteProductImagesFromCatalog(quoteId: string): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };
  await fillMissingQuoteProductImages(quoteId);
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

export async function restoreQuoteProductCatalogImage(input: {
  quoteId: string;
  productId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };
  const img = await catalogPrimaryImage(input.productId);
  if (!img) return { ok: false, error: "Este producto no tiene foto en el catálogo." };
  const item = loaded.quote.items.find((i) => i.productId === input.productId);
  await upsertQuoteProductImage({
    quoteId: input.quoteId,
    productId: input.productId,
    url: img.url,
    caption: item?.description || img.alt || "",
    source: QuoteNodeSource.CATALOG_SEARCH,
  });
  revalidatePath(`/admin/quotes/${input.quoteId}`);
  return { ok: true };
}

export async function uploadQuoteProductImage(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const quoteId = String(formData.get("quoteId") || "");
  const productId = String(formData.get("productId") || "");
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };
  if (!productId) return { ok: false, error: "Falta el producto." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí un archivo." };
  const buf = await file.arrayBuffer();
  const stored = await storeImage(
    `quotes/${quoteId}/product-${productId}-${Date.now()}-${file.name}`,
    buf,
    file.type || "image/jpeg"
  );
  if (!stored) {
    return { ok: false, error: "Para subir archivos hace falta BLOB_READ_WRITE_TOKEN. Mientras, usá Serper o una URL." };
  }
  const item = loaded.quote.items.find((i) => i.productId === productId);
  await upsertQuoteProductImage({
    quoteId,
    productId,
    url: stored,
    caption: item?.description || file.name,
    source: QuoteNodeSource.MANUAL,
  });
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

export async function uploadQuoteContextImage(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const quoteId = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí un archivo." };
  const buf = await file.arrayBuffer();
  const stored = await storeImage(
    `quotes/${quoteId}/ctx-${Date.now()}-${file.name}`,
    buf,
    file.type || "image/jpeg"
  );
  if (!stored) {
    return { ok: false, error: "Para subir archivos hace falta BLOB_READ_WRITE_TOKEN." };
  }
  const sectionId = String(formData.get("sectionId") || "").trim() || null;
  await prisma.quoteAsset.create({
    data: {
      quoteId,
      kind: QuoteAssetKind.APPLICATION,
      url: stored,
      caption: String(formData.get("caption") || file.name),
      aiGenerated: false,
      source: QuoteNodeSource.MANUAL,
      sortOrder: loaded.quote.assets.length,
      sectionId,
    },
  });
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}
