"use client";

import Link from "next/link";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { StockBadge } from "../catalog-grid";
import { AddToDraftButton } from "../add-to-draft-button";
import { Package } from "lucide-react";

export interface CompatibleAccessoryItem {
  relationId: string;
  productId: string;
  name: string;
  shortDescription: string | null;
  imageUrl: string | null;
  stockStatus: string;
  stockQuantity: number | null;
  isRequired: boolean;
  finalPriceUsd: number;
  kind: "PRINCIPAL" | "ACCESORIO";
  accessoryRequiredWithPrimary: boolean;
}

interface Props {
  parentProductName: string;
  items: CompatibleAccessoryItem[];
  /** Cambia el título y el copy según el tipo de relación. Default "ACCESSORY". */
  variant?: "ACCESSORY" | "CROSS_SELL" | "ALSO_PURCHASED";
}

const VARIANT_LABELS: Record<NonNullable<Props["variant"]>, { title: string; subtitle: (parent: string) => string }> = {
  ACCESSORY: {
    title: "Accesorios compatibles",
    subtitle: (parent) =>
      `Productos vinculados a ${parent} desde administración. Podés sumarlos a tu solicitud o ver su ficha.`,
  },
  CROSS_SELL: {
    title: "Productos alternativos",
    subtitle: (parent) =>
      `Productos sugeridos como alternativa o complemento a ${parent}.`,
  },
  ALSO_PURCHASED: {
    title: "Otros clientes también compraron",
    subtitle: (parent) =>
      `Productos que clientes adquirieron junto a ${parent}.`,
  },
};

export function CompatibleAccessoriesSection({ parentProductName, items, variant = "ACCESSORY" }: Props) {
  if (items.length === 0) return null;
  const labels = VARIANT_LABELS[variant];

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-accent" />
            {labels.title} ({items.length})
          </CardTitle>
          <p className="muted-text mt-1">
            {labels.subtitle(parentProductName).split(parentProductName).map((chunk, i, arr) => (
              <span key={i}>
                {chunk}
                {i < arr.length - 1 ? <strong className="font-medium text-foreground">{parentProductName}</strong> : null}
              </span>
            ))}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.relationId}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              <Link href={`/portal/products/${item.productId}`} className="block">
                <div className="aspect-[4/3] bg-white">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Sin imagen
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <Link href={`/portal/products/${item.productId}`} className="text-sm font-semibold hover:text-accent">
                  {item.name}
                </Link>
                {item.shortDescription ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{item.shortDescription}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-1">
                  <StockBadge status={item.stockStatus} qty={item.stockQuantity} />
                  {item.isRequired ? <Badge tone="warning">Obligatorio</Badge> : null}
                  {item.kind === "ACCESORIO" ? <Badge tone="muted">Accesorio</Badge> : null}
                </div>
                <p className="text-base font-semibold">{formatUsd(item.finalPriceUsd)}</p>
                <AddToDraftButton productId={item.productId} productName={item.name} compact />
              </div>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
