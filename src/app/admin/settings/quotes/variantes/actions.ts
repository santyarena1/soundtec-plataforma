"use server";

import { revalidatePath } from "next/cache";
import { requireQuotePermission } from "@/lib/quote-access";
import { saveBlockVariants, type QuoteBlockVariant } from "@/lib/quote-block-variants";

export async function saveBlockVariantsAction(blockKey: string, variants: QuoteBlockVariant[]) {
  await requireQuotePermission("quotes.manage_library");
  await saveBlockVariants(blockKey, variants);
  revalidatePath("/admin/settings/quotes/variantes");
  revalidatePath("/admin/settings/quotes");
}
