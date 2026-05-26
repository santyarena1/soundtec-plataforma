import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { getActiveDraftSummary } from "@/lib/draft-request";
import { Heart, Package, Send, ShoppingBag } from "lucide-react";

export const metadata = { title: "Portal" };

export default async function PortalDashboardPage() {
  const user = await requireUser();

  const [totalProducts, favorites, openRequests, recentRequests, recentPosts, activeDraft] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.wishlistItem.count({ where: { wishlist: { userId: user.id } } }),
    prisma.customerRequest.count({
      where: { userId: user.id, status: { in: ["SENT", "IN_REVIEW", "ANSWERED"] } },
    }),
    prisma.customerRequest.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { items: true } } },
    }),
    prisma.landingPost.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
    getActiveDraftSummary(user.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">Bienvenido,</p>
        <h1 className="heading-2 mt-1">{user.name}</h1>
        <p className="muted-text">{user.companyName || user.email}</p>
      </div>

      {activeDraft && activeDraft.itemCount > 0 ? (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Mi solicitud en armado</p>
                <p className="text-sm text-muted-foreground">
                  {activeDraft.itemCount} producto(s) · {activeDraft.unitCount} unidad(es)
                </p>
              </div>
            </div>
            <ButtonLink href={`/portal/requests/${activeDraft.id}`}>Continuar armando</ButtonLink>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Package className="h-5 w-5" />
              </span>
              <div>
                <p className="muted-text">Catálogo</p>
                <p className="text-2xl font-semibold">{totalProducts}</p>
              </div>
            </div>
            <ButtonLink href="/portal/products" variant="outline" size="sm" className="mt-4">
              Ver catálogo
            </ButtonLink>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                <Heart className="h-5 w-5" />
              </span>
              <div>
                <p className="muted-text">Favoritos</p>
                <p className="text-2xl font-semibold">{favorites}</p>
              </div>
            </div>
            <ButtonLink href="/portal/wishlist" variant="outline" size="sm" className="mt-4">
              Ver favoritos
            </ButtonLink>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success/10 text-success">
                <Send className="h-5 w-5" />
              </span>
              <div>
                <p className="muted-text">Solicitudes abiertas</p>
                <p className="text-2xl font-semibold">{openRequests}</p>
              </div>
            </div>
            <ButtonLink href="/portal/requests" variant="outline" size="sm" className="mt-4">
              Ver solicitudes
            </ButtonLink>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <CardTitle>Últimas solicitudes</CardTitle>
              <Link href="/portal/requests" className="text-sm font-medium text-accent hover:underline">
                Ver todas
              </Link>
            </div>
            <div className="mt-4 divide-y divide-border">
              {recentRequests.length === 0 ? (
                <p className="muted-text py-8 text-center">Aún no creaste solicitudes.</p>
              ) : (
                recentRequests.map((r) => (
                  <Link
                    key={r.id}
                    href={`/portal/requests/${r.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-secondary/40"
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
            <CardTitle>Novedades</CardTitle>
            <CardDescription className="mt-1">Comunicaciones del equipo Soundtec.</CardDescription>
            <ul className="mt-4 space-y-3">
              {recentPosts.length === 0 ? (
                <p className="muted-text">Aún no hay publicaciones.</p>
              ) : (
                recentPosts.map((p) => (
                  <li key={p.id}>
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.publishedAt || p.createdAt)}</p>
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
