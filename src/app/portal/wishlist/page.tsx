import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { calculatePricesForProducts } from "@/lib/pricing";
import { resolveCommercialClientId } from "@/lib/client-context";
import { getGlobalMarginPercent } from "@/lib/settings";
import { formatUsd } from "@/lib/utils";
import { Heart, Trash2 } from "lucide-react";
import { removeWishlistItem } from "@/server/actions/wishlist";
import { createRequestDraft } from "@/server/actions/requests";
import { productCoverImageInclude } from "@/lib/product-cover-image";

export const metadata = { title: "Favoritos" };

export default async function WishlistPage() {
  const user = await requireUser();
  const wishlist = await prisma.wishlist.findFirst({
    where: { userId: user.id, isDefault: true },
    include: {
      items: {
        include: {
          product: {
            include: { brand: true, images: productCoverImageInclude },
          },
        },
      },
    },
  });

  if (!wishlist || wishlist.items.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Favoritos" description="Productos que marcaste como favoritos desde el catálogo." />
        <EmptyState
          icon={<Heart className="h-5 w-5" />}
          title="Aún no tenés favoritos"
          description="Marcá productos como favoritos desde el catálogo y aparecerán acá."
          action={<ButtonLink href="/portal/products">Ir al catálogo</ButtonLink>}
        />
      </div>
    );
  }

  const commercialClientId = await resolveCommercialClientId(user.id);
  const globalMargin = await getGlobalMarginPercent();
  const prices = await calculatePricesForProducts(
    wishlist.items.map((i) => ({
      productId: i.product.id,
      baseCostUsd: Number(i.product.baseCostUsd),
      brandId: i.product.brandId,
      distributorId: i.product.distributorId,
      categoryId: i.product.categoryId,
      familyId: i.product.familyId,
      productDiscountPercent: i.product.discountPercent ? Number(i.product.discountPercent) : null,
      tariffDutyPercent: i.product.tariffDutyPercent ? Number(i.product.tariffDutyPercent) : null,
      coefNac: i.product.coefNac != null ? Number(i.product.coefNac) : null,
      coefVta: i.product.coefVta != null ? Number(i.product.coefVta) : null,
      coefVtaFob: i.product.coefVtaFob != null ? Number(i.product.coefVtaFob) : null,
      ivaPercent: i.product.ivaPercent != null ? Number(i.product.ivaPercent) : null,
      impIntPercent: i.product.impIntPercent != null ? Number(i.product.impIntPercent) : null,
    })),
    commercialClientId,
    globalMargin
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Favoritos"
        description={`${wishlist.items.length} producto(s) marcados como favoritos.`}
        actions={
          <form action={createRequestDraft}>
            <input type="hidden" name="fromWishlistId" value={wishlist.id} />
            <input type="hidden" name="type" value="QUOTE" />
            <Button type="submit">Solicitar cotización con todos</Button>
          </form>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {wishlist.items.map((item) => (
          <Card key={item.id} className="flex flex-col">
            <Link href={`/portal/products/${item.product.id}`} className="block">
              <div className="aspect-[4/3] overflow-hidden rounded-t-lg bg-white">
                {item.product.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.product.images[0].url}
                    alt={item.product.normalizedName}
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>
            </Link>
            <CardContent className="flex flex-1 flex-col gap-2 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {item.product.brand?.name || "—"}
              </p>
              <Link
                href={`/portal/products/${item.product.id}`}
                title={item.product.normalizedName}
                className="mt-0.5 block min-h-[3.75rem] line-clamp-3 w-full text-sm font-semibold leading-5 hover:underline"
              >
                {item.product.normalizedName}
              </Link>
              <p className="mt-auto text-lg font-semibold">
                {formatUsd(prices.get(item.product.id)?.finalPriceUsd ?? 0)}
              </p>
              <form action={removeWishlistItem}>
                <input type="hidden" name="itemId" value={item.id} />
                <Button variant="ghost" size="sm" type="submit" className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" /> Quitar
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
