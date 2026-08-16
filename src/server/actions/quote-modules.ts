"use server";

import { QuoteAssetKind, QuoteNodeSource, QuoteSectionOrigin } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser, requireQuotePermission } from "@/lib/quote-access";
import {
  CUSTOM_SECTION_TYPE,
  parseQuoteModuleLayout,
  type QuoteModuleLayout,
} from "@/lib/quote-module-layout";
import { sanitizeQuoteHtml } from "@/lib/quote-richtext";
import { draftCustomModuleBody } from "@/services/quote-orchestrator";

export type LibraryModuleRow = {
  id: string;
  title: string;
  body: string;
  prompt: string | null;
  layout: QuoteModuleLayout;
  imageCount: number;
  updatedAt: string;
};

function revalidateQuote(quoteId: string) {
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/settings/quotes/modulos");
}

async function insertBeforeClosing(quoteId: string) {
  const sections = await prisma.quoteSection.findMany({
    where: { quoteId },
    select: { id: true, type: true, sortOrder: true },
  });
  const closing = sections.find((section) => section.type === "closing");
  const sortOrder = closing ? closing.sortOrder : sections.reduce((max, section) => Math.max(max, section.sortOrder), -1) + 1;
  if (closing) {
    await prisma.quoteSection.updateMany({
      where: { quoteId, sortOrder: { gte: sortOrder } },
      data: { sortOrder: { increment: 1 } },
    });
  }
  return sortOrder;
}

export async function listQuoteModuleLibrary(): Promise<LibraryModuleRow[]> {
  await requireQuotePermission("quotes.edit");
  const rows = await prisma.quoteModuleLibrary.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { images: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    prompt: row.prompt,
    layout: parseQuoteModuleLayout(row.layout),
    imageCount: row._count.images,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createCustomQuoteModule(input: {
  quoteId: string;
  title: string;
  body?: string;
  prompt?: string;
  layout?: string;
  saveToLibrary?: boolean;
}): Promise<{ ok: boolean; error?: string; sectionId?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Poné un título para el módulo." };

  let body = (input.body || "").trim();
  const prompt = (input.prompt || "").trim();
  if (!body && prompt) {
    try {
      body = await draftCustomModuleBody({
        title,
        prompt,
        brief: loaded.quote.brief,
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "No se pudo redactar el módulo." };
    }
  }
  if (!body) return { ok: false, error: "Escribí el cuerpo o un prompt para que la IA lo arme." };

  const layout = parseQuoteModuleLayout(input.layout);
  const cleanBody = sanitizeQuoteHtml(body);
  let libraryId: string | null = null;
  if (input.saveToLibrary) {
    const draft = await prisma.quoteModuleLibrary.create({
      data: {
        title,
        body: cleanBody,
        prompt: prompt || null,
        layout,
        createdById: loaded.user.id,
      },
    });
    libraryId = draft.id;
  }

  const sortOrder = await insertBeforeClosing(input.quoteId);
  const section = await prisma.quoteSection.create({
    data: {
      quoteId: input.quoteId,
      type: CUSTOM_SECTION_TYPE,
      title,
      body: cleanBody,
      origin: QuoteSectionOrigin.MANUAL,
      source: prompt ? QuoteNodeSource.GENERATED : QuoteNodeSource.MANUAL,
      locked: false,
      included: true,
      sortOrder,
      layout,
      libraryId,
      lastInstruction: prompt || null,
    },
  });

  revalidateQuote(input.quoteId);
  return { ok: true, sectionId: section.id };
}

export async function insertLibraryModule(input: {
  quoteId: string;
  libraryId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };

  const draft = await prisma.quoteModuleLibrary.findUnique({
    where: { id: input.libraryId },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
  if (!draft || !draft.isActive) return { ok: false, error: "Ese borrador ya no está." };

  const sortOrder = await insertBeforeClosing(input.quoteId);
  const section = await prisma.quoteSection.create({
    data: {
      quoteId: input.quoteId,
      type: CUSTOM_SECTION_TYPE,
      title: draft.title,
      body: draft.body,
      origin: QuoteSectionOrigin.TEMPLATE,
      source: QuoteNodeSource.TEMPLATE,
      included: true,
      sortOrder,
      layout: parseQuoteModuleLayout(draft.layout),
      libraryId: draft.id,
    },
  });

  if (draft.images.length) {
    await prisma.quoteAsset.createMany({
      data: draft.images.map((image, index) => ({
        quoteId: input.quoteId,
        kind: image.aiGenerated ? QuoteAssetKind.GENERATED : QuoteAssetKind.APPLICATION,
        url: image.url,
        caption: image.caption,
        aiGenerated: image.aiGenerated,
        source: image.source,
        sortOrder: loaded.quote!.assets.length + index,
        sectionId: section.id,
      })),
    });
  }

  revalidateQuote(input.quoteId);
  return { ok: true };
}

export async function updateQuoteSectionLayout(input: {
  sectionId: string;
  layout: string;
}): Promise<{ ok: boolean; error?: string }> {
  const section = await prisma.quoteSection.findUnique({ where: { id: input.sectionId } });
  if (!section) return { ok: false, error: "El módulo ya no existe." };
  const loaded = await loadQuoteForUser(section.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };
  await prisma.quoteSection.update({
    where: { id: section.id },
    data: { layout: parseQuoteModuleLayout(input.layout) },
  });
  revalidateQuote(section.quoteId);
  return { ok: true };
}

export async function saveSectionToLibrary(input: {
  sectionId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const section = await prisma.quoteSection.findUnique({ where: { id: input.sectionId } });
  if (!section) return { ok: false, error: "El módulo ya no existe." };
  const loaded = await loadQuoteForUser(section.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };

  const images = loaded.quote.assets
    .filter((asset) => asset.sectionId === section.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const draft = await prisma.quoteModuleLibrary.create({
    data: {
      title: section.title,
      body: section.body,
      prompt: section.lastInstruction,
      layout: parseQuoteModuleLayout(section.layout),
      createdById: loaded.user.id,
      images: {
        create: images.map((image, index) => ({
          url: image.url,
          caption: image.caption,
          sortOrder: index,
          source: image.source,
          aiGenerated: image.aiGenerated,
        })),
      },
    },
  });
  await prisma.quoteSection.update({
    where: { id: section.id },
    data: { libraryId: draft.id },
  });
  revalidateQuote(section.quoteId);
  return { ok: true };
}

export async function archiveLibraryModule(input: { id: string }): Promise<{ ok: boolean; error?: string }> {
  await requireQuotePermission("quotes.manage_library");
  await prisma.quoteModuleLibrary.update({
    where: { id: input.id },
    data: { isActive: false },
  });
  revalidatePath("/admin/settings/quotes/modulos");
  revalidatePath("/admin/settings/quotes");
  return { ok: true };
}

export async function removeCustomQuoteModule(input: {
  sectionId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const section = await prisma.quoteSection.findUnique({ where: { id: input.sectionId } });
  if (!section) return { ok: false, error: "El módulo ya no existe." };
  if (section.type !== CUSTOM_SECTION_TYPE) return { ok: false, error: "Sólo se pueden quitar módulos extra." };
  const loaded = await loadQuoteForUser(section.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };
  await prisma.quoteAsset.deleteMany({ where: { sectionId: section.id } });
  await prisma.quoteSection.delete({ where: { id: section.id } });
  revalidateQuote(section.quoteId);
  return { ok: true };
}
