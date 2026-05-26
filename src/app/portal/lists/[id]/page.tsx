import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { calculatePricesForProducts } from "@/lib/pricing";
import { resolveCommercialClientId } from "@/lib/client-context";
import { getGlobalMarginPercent } from "@/lib/settings";
import { formatUsd } from "@/lib/utils";
import { removeWishlistItem } from "@/server/actions/wishlist";
import { createRequestDraft } from "@/server/actions/requests";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const list = await prisma.wishlist.findFirst({
    where: { id, userId: user.id },
    include: {
      items: {
        include: { product: { include: { brand: true } } },
      },
    },
  });
  if (!list) notFound();

  const commercialClientId = await resolveCommercialClientId(user.id);
  const globalMargin = await getGlobalMarginPercent();
  const prices = await calculatePricesForProducts(
    list.items.map((i) => ({
      productId: i.product.id,
      baseCostUsd: Number(i.product.baseCostUsd),
      brandId: i.product.brandId,
      distributorId: i.product.distributorId,
      categoryId: i.product.categoryId,
      familyId: i.product.familyId,
      productDiscountPercent: i.product.discountPercent ? Number(i.product.discountPercent) : null,
      tariffDutyPercent: i.product.tariffDutyPercent ? Number(i.product.tariffDutyPercent) : null,
    })),
    commercialClientId,
    globalMargin
  );

  const subtotal = list.items.reduce(
    (acc, i) => acc + (prices.get(i.product.id)?.finalPriceUsd ?? 0) * i.quantity,
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={list.name}
        description={`${list.items.length} producto(s) · Subtotal estimado ${formatUsd(subtotal)}`}
        actions={
          <>
            <ButtonLink href="/portal/lists" variant="outline" size="sm">
              ← Volver
            </ButtonLink>
            {list.items.length > 0 ? (
              <form action={createRequestDraft}>
                <input type="hidden" name="fromWishlistId" value={list.id} />
                <input type="hidden" name="type" value="QUOTE" />
                <Button type="submit">Agregar lista a mi solicitud</Button>
              </form>
            ) : null}
          </>
        }
      />

      {list.items.length === 0 ? (
        <TableEmpty message="Esta lista todavía no tiene productos." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Producto</TH>
              <TH>Marca</TH>
              <TH>Cantidad</TH>
              <TH className="text-right">Precio U.</TH>
              <TH className="text-right">Subtotal</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {list.items.map((item) => {
              const price = prices.get(item.product.id)?.finalPriceUsd ?? 0;
              return (
                <TR key={item.id}>
                  <TD>
                    <Link href={`/portal/products/${item.product.id}`} className="hover:underline">
                      {item.product.normalizedName}
                    </Link>
                  </TD>
                  <TD>{item.product.brand?.name || "—"}</TD>
                  <TD>{item.quantity}</TD>
                  <TD className="text-right">{formatUsd(price)}</TD>
                  <TD className="text-right">{formatUsd(price * item.quantity)}</TD>
                  <TD className="text-right">
                    <form action={removeWishlistItem}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                        Quitar
                      </Button>
                    </form>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
