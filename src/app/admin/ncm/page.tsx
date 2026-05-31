import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { NcmSearchClient } from "./ncm-search-client";
import { AiSuggestionsClient } from "./ai-suggestions-client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

export const metadata = { title: "Admin · Posiciones NCM" };

export default async function NcmPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const { tab } = await searchParams;
  const isAiTab = tab === "ia";

  // For AI tab: fetch products without tariff position
  const products = isAiTab
    ? await prisma.product.findMany({
        where: { isActive: true, OR: [{ tariffPosition: null }, { tariffPosition: "" }] },
        orderBy: { normalizedName: "asc" },
        select: { id: true, normalizedName: true, internalSku: true, tariffPosition: true },
        take: 100,
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posiciones arancelarias (NCM)"
        description="Buscá y asigná posiciones NCM a tus productos. Fuente: PCRAM."
      />

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <Link
          href="/admin/ncm"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            !isAiTab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          Buscador
        </Link>
        <Link
          href="/admin/ncm?tab=ia"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            isAiTab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          Sugerencias IA
          {!isAiTab && (
            <span className="ml-1.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              IA
            </span>
          )}
        </Link>
      </div>

      {isAiTab ? <AiSuggestionsClient products={products} /> : <NcmSearchClient />}
    </div>
  );
}
