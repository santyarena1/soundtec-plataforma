import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseShareListFilters, resolveShareablePriceListProducts } from "@/lib/shareable-price-list";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ShareListTable } from "./share-list-table";
import { ShareListCta } from "./share-list-cta";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createHash } from "crypto";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const list = await prisma.shareablePriceList.findUnique({ where: { shareSlug: slug }, select: { name: true } });
  return { title: list?.name || "Lista de precios", robots: { index: false, follow: false } };
}

export default async function PublicShareListPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;

  const list = await prisma.shareablePriceList.findUnique({
    where: { shareSlug: slug },
    include: { client: { select: { companyName: true } } },
  });

  if (!list || list.status !== "ACTIVE") notFound();
  if (list.expiresAt && list.expiresAt < new Date()) notFound();

  const requestHeaders = await headers(); const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  void prisma.$transaction([prisma.shareablePriceList.update({ where: { id: list.id }, data: { viewCount: { increment: 1 } } }),
    prisma.shareablePriceListView.create({ data: { listId: list.id, userAgent: requestHeaders.get("user-agent"), referer: requestHeaders.get("referer"),
      ipHash: forwarded ? createHash("sha256").update(forwarded).digest("hex") : null } })]).catch(() => {});

  const filters = parseShareListFilters(list.filters);
  const page = Math.max(1, Number((await searchParams).page) || 1); const pageSize = 200;
  const total = await import("@/lib/shareable-price-list").then((m) => m.countShareablePriceListProducts(filters, list.clientId));
  const items = await resolveShareablePriceListProducts({
    filters,
    clientId: list.clientId,
    limit: pageSize, offset: (page - 1) * pageSize, includePrices: !list.hidePrices,
  });
  const [session, setting] = await Promise.all([auth(), prisma.adminSetting.findUnique({ where: { key: "share_lists.contact_email" }, select: { value: true } })]);
  const email = setting?.value?.trim() || "contacto@soundtec.com.ar";
  const mailto = `mailto:${email}?subject=${encodeURIComponent("Cotización · " + list.name)}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Soundtec · Lista de precios</p>
          <h1 className="heading-2 mt-1 text-2xl sm:text-3xl">{list.name}</h1>
          {list.description ? <p className="muted-text mt-2 max-w-2xl">{list.description}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {list.client ? <Badge tone="primary">Precios: {list.client.companyName}</Badge> : null}
            <Badge tone="muted">Mostrando {Math.min((page - 1) * pageSize + items.length, total)} de {total}</Badge>
            {list.expiresAt ? <span>Válida hasta {formatDate(list.expiresAt)}</span> : null}
          </div>
          <div className="mt-4"><ShareListCta mailto={mailto} productIds={items.map((i) => i.id)} canAdd={session?.user?.role === "CLIENT"} /></div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            Esta lista no tiene productos con los filtros actuales.
          </p>
        ) : (
          <ShareListTable
            items={items}
            showSku={list.showSku}
            showStock={list.showStock}
            hidePrices={list.hidePrices}
          />
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Precios en USD · referencia comercial Soundtec. Sujetos a confirmación al formalizar pedido.
        </p>
        {total > pageSize ? <div className="mt-4 flex justify-center gap-2">{page > 1 ? <Link className="text-sm text-accent" href={`?page=${page - 1}`}>Anterior</Link> : null}
          {page * pageSize < total ? <Link className="text-sm text-accent" href={`?page=${page + 1}`}>Siguiente</Link> : null}</div> : null}
        <div className="mt-8 flex justify-center"><ShareListCta mailto={mailto} productIds={items.map((i) => i.id)} canAdd={session?.user?.role === "CLIENT"} /></div>
      </main>
    </div>
  );
}
