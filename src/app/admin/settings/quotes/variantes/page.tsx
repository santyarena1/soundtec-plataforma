import { redirect } from "next/navigation";

/** Las versiones se editan junto a cada texto, en Textos del PDF. */
export default function QuoteBlockVariantsPage() {
  redirect("/admin/settings/quotes/textos");
}
