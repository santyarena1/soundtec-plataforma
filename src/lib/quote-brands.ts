import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { prisma } from "@/lib/prisma";

export type BrandsDisplayMode = "collage" | "individual";

export type QuoteBrandLogoView = {
  id: string;
  label: string;
  url: string;
  visible: boolean;
  sortOrder: number;
  libraryLogoId: string | null;
};

export async function getGlobalBrandsDisplayMode(): Promise<BrandsDisplayMode> {
  const raw = await getSetting(QUOTE_SETTING_KEYS.brandsDisplayMode, "collage");
  return raw === "individual" ? "individual" : "collage";
}

export function resolveBrandsDisplayMode(
  quoteBrandsMode: string | null | undefined,
  global: BrandsDisplayMode
): BrandsDisplayMode {
  if (quoteBrandsMode === "individual" || quoteBrandsMode === "collage") return quoteBrandsMode;
  return global;
}

export async function resolveQuoteBrandsDisplayMode(quoteId: string): Promise<BrandsDisplayMode> {
  const [quote, global] = await Promise.all([
    prisma.quote.findUnique({ where: { id: quoteId }, select: { brandsMode: true } }),
    getGlobalBrandsDisplayMode(),
  ]);
  return resolveBrandsDisplayMode(quote?.brandsMode, global);
}

export async function listQuoteBrandSelections(quoteId: string): Promise<QuoteBrandLogoView[]> {
  const rows = await prisma.quoteBrandSelection.findMany({
    where: { quoteId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    url: row.url,
    visible: row.visible,
    sortOrder: row.sortOrder,
    libraryLogoId: row.libraryLogoId,
  }));
}

export async function visibleQuoteBrandLogos(quoteId: string): Promise<QuoteBrandLogoView[]> {
  const mode = await resolveQuoteBrandsDisplayMode(quoteId);
  if (mode !== "individual") return [];
  return (await listQuoteBrandSelections(quoteId)).filter((logo) => logo.visible && logo.url.trim());
}
