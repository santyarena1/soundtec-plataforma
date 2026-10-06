import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCatalogBrands } from "@/lib/catalog-brands";
import { BrandInquiryForm } from "./inquiry-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consultá disponibilidad" };

/**
 * Marca oficial que todavía no tiene productos en el catálogo: se invita a
 * dejar la consulta (queda como lead en CRM → Leads del catálogo).
 */
export default async function BrandInquiryPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const { marca } = await searchParams;
  if (!marca) notFound();
  const brand = await prisma.brand.findFirst({
    where: { id: marca, isActive: true, hiddenFromCatalog: false },
    select: { id: true, name: true },
  });
  if (!brand) notFound();
  const logoUrl = (await getCatalogBrands()).find((b) => b.id === brand.id)?.logoUrl ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </Link>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brand.name} className="h-20 w-auto max-w-[80%] object-contain" />
          ) : (
            <p className="text-2xl font-bold tracking-wide">{brand.name}</p>
          )}
          <h1 className="mt-5 text-2xl font-semibold leading-tight tracking-tight">
            <span className="block">Productos de {brand.name}</span>
            <span className="block">disponibles a pedido</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Todavía no cargamos los productos de {brand.name} en el catálogo, pero trabajamos la marca y los tenemos
            disponibles. Dejanos tu consulta y te respondemos con precios, disponibilidad y asesoramiento para tu
            proyecto.
          </p>
        </div>
        <div className="mt-6">
          <BrandInquiryForm brandName={brand.name} />
        </div>
      </div>
    </div>
  );
}
