import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { productCoverImageInclude } from "@/lib/product-cover-image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ProductGallery } from "@/app/portal/products/[id]/product-gallery";
import { ProductRichInfo } from "@/app/portal/products/[id]/product-rich-info";
import { ArrowLeft, ArrowRight, FileText, Lock, Package } from "lucide-react";

export const dynamic = "force-dynamic";

const RELATION_SECTIONS: Array<{ kind: string; title: string; hint: string }> = [
  { kind: "INCLUDED", title: "Incluido en la caja", hint: "Viene con el producto." },
  { kind: "ACCESSORY", title: "Accesorios compatibles", hint: "Complementos que el fabricante lista para este producto." },
  { kind: "COMPATIBLE", title: "Compatible con", hint: "Productos de nuestro catálogo mencionados en la ficha." },
  { kind: "MODEL_VARIANT", title: "Otros modelos de esta línea", hint: "Variantes del mismo producto." },
  { kind: "RELATED", title: "Productos relacionados", hint: "Sugeridos por el fabricante." },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, isActive: true },
    select: { normalizedName: true, shortDescription: true, brand: { select: { name: true } } },
  });
  if (!product) return { title: "Producto" };
  return {
    title: `${product.normalizedName}${product.brand?.name ? ` · ${product.brand.name}` : ""}`,
    description: product.shortDescription ?? undefined,
  };
}

export default async function PublicProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, session] = await Promise.all([
    prisma.product.findFirst({
      where: { id, isActive: true },
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        family: { select: { name: true } },
        images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        accessories: {
          include: {
            accessoryProduct: {
              select: {
                id: true,
                normalizedName: true,
                shortDescription: true,
                isActive: true,
                kind: true,
                brand: { select: { name: true } },
                images: productCoverImageInclude,
              },
            },
          },
          orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    auth().catch(() => null),
  ]);
  if (!product) notFound();
  const isLogged = !!session?.user;
  const portalHref = `/portal/products/${product.id}`;

  const sections = RELATION_SECTIONS.map((section) => ({
    ...section,
    items: product.accessories.filter((r) => r.kind === section.kind && r.accessoryProduct.isActive),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="space-y-8">
      <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <ProductGallery
            images={product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt }))}
            productName={product.normalizedName}
          />
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {[product.brand?.name, product.category?.name].filter(Boolean).join(" · ") || "Producto"}
            </p>
            <h1 className="heading-2 text-2xl leading-tight sm:text-3xl">{product.normalizedName}</h1>
            {product.shortDescription ? <p className="muted-text">{product.shortDescription}</p> : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {product.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : null}
              {product.isCustomizable ? <Badge tone="accent">Configurable</Badge> : null}
              {product.isCrestronHomeCompatible ? <Badge tone="primary">Crestron Home</Badge> : null}
              {product.isDiscontinued ? <Badge tone="muted">Discontinuado por el fabricante</Badge> : null}
              {product.modelNumber ? (
                <span className="text-xs text-muted-foreground">Modelo: {product.modelNumber}</span>
              ) : null}
            </div>
          </div>

          <Card className="border-primary/15 bg-gradient-to-br from-card to-primary/5">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Lock className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">Precio y disponibilidad para clientes</p>
                  <p className="text-sm text-muted-foreground">
                    {isLogged
                      ? "Estás logueado: abrí este producto en tu portal para ver tu precio y el stock."
                      : "Con una cuenta ves tu precio en USD, el stock por depósito y podés armar tu pedido."}
                  </p>
                </div>
              </div>
              {isLogged ? (
                <Link
                  href={portalHref}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Ver en mi portal <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/login?callbackUrl=${encodeURIComponent(portalHref)}`}
                    className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Ingresar
                  </Link>
                  <Link
                    href="/#acceso"
                    className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary"
                  >
                    Pedir cuenta
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ProductRichInfo
        specifications={product.specifications ?? null}
        documents={product.documents ?? null}
        badges={product.badges ?? null}
        videoUrl={product.videoUrl ?? null}
        htmlContent={product.htmlContent ?? null}
        widthCm={product.widthCm != null ? Number(product.widthCm) : null}
        heightCm={product.heightCm != null ? Number(product.heightCm) : null}
        depthCm={product.depthCm != null ? Number(product.depthCm) : null}
        weight={product.weight != null ? Number(product.weight) : null}
        modelNumber={product.modelNumber ?? null}
        manufacturerItem={product.manufacturerItem ?? null}
        productLine={product.productLine ?? null}
        isCrestronHomeCompatible={product.isCrestronHomeCompatible}
      />

      {product.longDescription ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              <CardTitle>Descripción técnica</CardTitle>
            </div>
            <div className="prose prose-sm max-w-none text-foreground">
              {product.longDescription.split("\n").map((line, i) => (
                <p key={i} className="my-2">
                  {line}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sections.map((section) => (
        <Card key={section.kind}>
          <CardContent className="space-y-4 p-6">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4 text-accent" />
                {section.title} ({section.items.length})
              </CardTitle>
              <p className="muted-text mt-1">{section.hint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {section.items.map((r) => (
                <Link
                  key={r.id}
                  href={`/catalogo/${r.accessoryProduct.id}`}
                  className="flex gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-accent/50"
                >
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                    {r.accessoryProduct.images[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.accessoryProduct.images[0].url} alt={r.accessoryProduct.normalizedName} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                      {r.accessoryProduct.brand?.name ?? ""}
                    </span>
                    <span className="block text-sm font-medium leading-snug line-clamp-2">
                      {r.accessoryProduct.normalizedName}
                    </span>
                    {section.kind === "INCLUDED" && r.quantity && r.quantity > 1 ? (
                      <span className="text-xs text-muted-foreground">×{r.quantity}</span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
