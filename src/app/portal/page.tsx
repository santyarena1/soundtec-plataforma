import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { getActiveDraftSummary } from "@/lib/draft-request";
import { productCoverImageInclude } from "@/lib/product-cover-image";
import {
  ArrowRight,
  Heart,
  Package,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Tag,
  Warehouse,
} from "lucide-react";

export const metadata = { title: "Inicio" };

const QUICK_FILTERS = [
  { label: "En stock", href: "/portal/products?stock=in_stock", icon: Warehouse },
  { label: "Con descuento", href: "/portal/products?discount=1", icon: Tag },
  { label: "Crestron Home", href: "/portal/products?crestron=1", icon: Sparkles },
  { label: "Mis favoritos", href: "/portal/products?fav=1", icon: Heart },
] as const;

const TOP_CATEGORIES = 8;
const RECENT_PRODUCTS = 6;
const RECENT_REQUESTS = 5;

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("es-AR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date())
  );
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default async function PortalDashboardPage() {
  const user = await requireUser();

  const [
    totalProducts,
    favorites,
    openRequests,
    recentRequests,
    recentPosts,
    activeDraft,
    topCategories,
    recentProducts,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.wishlistItem.count({ where: { wishlist: { userId: user.id } } }),
    prisma.customerRequest.count({
      where: { userId: user.id, status: { in: ["SENT", "IN_REVIEW", "ANSWERED"] } },
    }),
    prisma.customerRequest.findMany({
      where: { userId: user.id, status: { not: "DRAFT" } },
      orderBy: { updatedAt: "desc" },
      take: RECENT_REQUESTS,
      include: { _count: { select: { items: true } } },
    }),
    prisma.landingPost.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
    getActiveDraftSummary(user.id),
    prisma.category.findMany({
      where: { isActive: true, products: { some: { isActive: true } } },
      select: { id: true, name: true, _count: { select: { products: { where: { isActive: true } } } } },
      orderBy: { products: { _count: "desc" } },
      take: TOP_CATEGORIES,
    }),
    prisma.product.findMany({
      where: { isActive: true, kind: "PRINCIPAL" },
      orderBy: { createdAt: "desc" },
      take: RECENT_PRODUCTS,
      select: {
        id: true,
        normalizedName: true,
        shortDescription: true,
        brand: { select: { name: true } },
        images: productCoverImageInclude,
      },
    }),
  ]);

  const firstName = (user.name || "").split(" ")[0] || user.email;

  return (
    <div className="space-y-8">
      {/* Hero: búsqueda primero */}
      <section className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-primary-foreground/10 blur-3xl" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:p-10">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/60">
              {greeting()}, {firstName}
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">
              ¿Qué necesitás cotizar hoy?
            </h1>
            <p className="mt-2 max-w-lg text-sm text-primary-foreground/75">
              Buscá por modelo, marca o palabra clave. Los precios que ves ya incluyen las condiciones de{" "}
              <span className="font-medium text-primary-foreground">{user.companyName || "tu cuenta"}</span>.
            </p>

            <form action="/portal/products" method="get" className="mt-6">
              <label htmlFor="home-search" className="sr-only">
                Buscar en el catálogo
              </label>
              <div className="flex items-stretch overflow-hidden rounded-xl bg-background shadow-elevated ring-1 ring-primary-foreground/10 focus-within:ring-2 focus-within:ring-accent">
                <span className="flex items-center pl-4 text-muted-foreground">
                  <Search className="h-5 w-5" />
                </span>
                <input
                  id="home-search"
                  name="q"
                  type="search"
                  autoComplete="off"
                  placeholder="Ej. CP4, parlante de techo, DM NVX, micrófono inalámbrico…"
                  className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground/70 sm:h-14"
                />
                <button
                  type="submit"
                  className="m-1.5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  Buscar
                  <ArrowRight className="hidden h-4 w-4 sm:block" />
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_FILTERS.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1.5 text-xs font-medium text-primary-foreground/90 transition-colors hover:bg-primary-foreground/15"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              ))}
              <Link
                href="/portal/products"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-primary-foreground/80 underline-offset-4 hover:underline"
              >
                Ver todo el catálogo
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 self-end lg:grid-cols-1">
            <HeroStat label="Productos" value={totalProducts.toLocaleString("es-AR")} href="/portal/products" />
            <HeroStat label="Favoritos" value={favorites.toLocaleString("es-AR")} href="/portal/wishlist" />
            <HeroStat label="Solicitudes abiertas" value={openRequests.toLocaleString("es-AR")} href="/portal/requests" />
          </dl>
        </div>
      </section>

      {/* Borrador en curso */}
      {activeDraft && activeDraft.itemCount > 0 ? (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Tenés una solicitud en armado</p>
                <p className="text-sm text-muted-foreground">
                  {activeDraft.itemCount} producto(s) · {activeDraft.unitCount} unidad(es) · última edición{" "}
                  {formatDate(activeDraft.updatedAt)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <ButtonLink href="/portal/products" variant="outline">
                Seguir agregando
              </ButtonLink>
              <ButtonLink href={`/portal/requests/${activeDraft.id}`}>
                Revisar y enviar <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Categorías */}
      {topCategories.length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="heading-3">Explorar por categoría</h2>
              <p className="muted-text mt-1">Las categorías con más productos disponibles para tu cuenta.</p>
            </div>
            <Link href="/portal/products" className="text-sm font-medium text-accent hover:underline">
              Todas las categorías
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/portal/products?category=${category.id}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{category.name}</p>
                  <p className="text-xs text-muted-foreground">{category._count.products} productos</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Novedades del catálogo */}
      {recentProducts.length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="heading-3">Recién llegados al catálogo</h2>
              <p className="muted-text mt-1">Los últimos productos incorporados.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recentProducts.map((product) => (
              <Link
                key={product.id}
                href={`/portal/products/${product.id}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
              >
                <div className="aspect-square bg-white p-3">
                  {product.images[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0].url}
                      alt={product.normalizedName}
                      className="h-full w-full object-contain transition-transform group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/60">
                      <Package className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 border-t border-border p-3">
                  {product.brand?.name ? (
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{product.brand.name}</p>
                  ) : null}
                  <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-accent">
                    {product.normalizedName}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Solicitudes + novedades del equipo */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Send className="h-4 w-4 text-accent" />
                Últimas solicitudes
              </CardTitle>
              <Link href="/portal/requests" className="text-sm font-medium text-accent hover:underline">
                Ver todas
              </Link>
            </div>
            <div className="mt-4 divide-y divide-border">
              {recentRequests.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="muted-text">Todavía no enviaste ninguna solicitud.</p>
                  <ButtonLink href="/portal/products" variant="outline" size="sm" className="mt-3">
                    Armar la primera desde el catálogo
                  </ButtonLink>
                </div>
              ) : (
                recentRequests.map((r) => (
                  <Link
                    key={r.id}
                    href={`/portal/requests/${r.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-secondary/50"
                  >
                    <div>
                      <p className="text-sm font-medium">Solicitud #{r.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">
                        {r._count.items} ítems · {formatDate(r.updatedAt)}
                      </p>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <CardTitle>Novedades Soundtec</CardTitle>
            <p className="muted-text mt-1">Comunicaciones del equipo.</p>
            <ul className="mt-4 space-y-4">
              {recentPosts.length === 0 ? (
                <li className="muted-text">Aún no hay publicaciones.</li>
              ) : (
                recentPosts.map((p) => (
                  <li key={p.id} className="border-l-2 border-accent/60 pl-3">
                    <p className="text-sm font-medium leading-snug">{p.title}</p>
                    {p.excerpt ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.excerpt}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {formatDate(p.publishedAt || p.createdAt)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HeroStat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 px-4 py-3 transition-colors hover:bg-primary-foreground/10"
    >
      <dt className="text-[11px] uppercase tracking-wider text-primary-foreground/60">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold leading-none sm:text-2xl">{value}</dd>
    </Link>
  );
}

function RequestStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "muted" | "neutral" | "primary" | "accent" | "success" | "warning" | "destructive"; label: string }> = {
    DRAFT: { tone: "muted", label: "Borrador" },
    SENT: { tone: "accent", label: "Enviada" },
    IN_REVIEW: { tone: "warning", label: "En revisión" },
    ANSWERED: { tone: "primary", label: "Respondida" },
    CONFIRMED: { tone: "success", label: "Confirmada" },
    REJECTED: { tone: "destructive", label: "Rechazada" },
    CLOSED: { tone: "muted", label: "Cerrada" },
  };
  const entry = map[status] || map.DRAFT;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
