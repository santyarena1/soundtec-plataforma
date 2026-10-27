import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, QUOTE_MODULES } from "@/lib/quote-defaults";

/**
 * Tipos de documento de una cotización. Hay tres base (Corto, Estándar,
 * Completo) y los que crea cada uno a partir de ellos («Compacto escolar»,
 * «Completo hotelería»…): cada tipo dice qué secciones lleva el PDF y, si
 * tiene rubro, qué versión de los textos sale. Se eligen al crear la
 * cotización (rápida, común o desde un pedido) y se pueden cambiar después.
 */
export const BASE_DOCUMENT_TYPES = [
  { key: "resumido", name: "Corto" },
  { key: "tecnico", name: "Estándar" },
  { key: "premium", name: "Completo" },
] as const;

export type BaseDocumentKey = (typeof BASE_DOCUMENT_TYPES)[number]["key"];

export const isBaseDocumentKey = (key: string | null | undefined): key is BaseDocumentKey =>
  BASE_DOCUMENT_TYPES.some((t) => t.key === key);

export const baseDocumentName = (key: string | null | undefined) => BASE_DOCUMENT_TYPES.find((t) => t.key === key)?.name ?? null;

export type DocumentType = {
  id: string;
  key: string;
  name: string;
  /** Corto / Estándar / Completo del que sale (el mismo para los tipos base). */
  baseKey: BaseDocumentKey;
  audience: string | null;
  sectionKeys: string[];
  isCustom: boolean;
  description: string | null;
};

/** Secciones que lleva por defecto un tipo base. */
export function baseSectionKeys(baseKey: BaseDocumentKey): string[] {
  return QUOTE_MODULES.filter((m) => m.defaultOn.includes(baseKey)).map((m) => m.key);
}

type ProfileRow = { id: string; key: string; name: string; baseKey: string | null; audience: string | null; sectionKeys: unknown; isCustom: boolean; description: string | null };

export function toDocumentType(row: ProfileRow): DocumentType {
  const baseKey: BaseDocumentKey = isBaseDocumentKey(row.baseKey) ? row.baseKey : isBaseDocumentKey(row.key) ? row.key : "tecnico";
  return {
    id: row.id,
    key: row.key,
    name: row.isCustom ? row.name : baseDocumentName(row.key) ?? row.name,
    baseKey,
    audience: row.audience,
    sectionKeys: Array.isArray(row.sectionKeys) ? (row.sectionKeys as string[]) : baseSectionKeys(baseKey),
    isCustom: row.isCustom,
    description: row.description,
  };
}

/** Todos los tipos activos: primero los tres base, después los propios por nombre. */
export async function listDocumentTypes(): Promise<DocumentType[]> {
  await ensureQuoteProfiles();
  const rows = await prisma.quoteContentProfile.findMany({ where: { isActive: true } });
  const order = (k: string) => BASE_DOCUMENT_TYPES.findIndex((t) => t.key === k);
  return rows
    .map(toDocumentType)
    .sort((a, b) => (a.isCustom === b.isCustom ? (a.isCustom ? a.name.localeCompare(b.name) : order(a.key) - order(b.key)) : a.isCustom ? 1 : -1));
}
