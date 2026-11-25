import Link from "next/link";
import type { Metadata } from "next";
import { parseCompareIds } from "@/lib/compare/selection";
import { loadCompareData, toCompareColumnView } from "@/server/catalog/compare";
import { CompareView } from "@/components/compare/compare-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Comparar productos", robots: { index: false } };

/** Comparación del catálogo público: fichas lado a lado, sin precios (se ven con cuenta). */
export default async function PublicComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const ids = parseCompareIds(params.ids);
  const data = await loadCompareData(ids, { commercialClientId: null, userId: null, isAdmin: false, publicMode: true });
  return (
    <CompareView
      columns={data.columns.map((c) => toCompareColumnView(c, "/catalogo"))}
      specs={data.specs}
      basePath="/catalogo/comparar"
      catalogHref="/catalogo"
      memoryKey="public"
      noPriceNote={
        <Link href="/solicitar-cuenta" className="font-medium text-primary hover:underline">
          Precio para clientes con cuenta
        </Link>
      }
    />
  );
}
