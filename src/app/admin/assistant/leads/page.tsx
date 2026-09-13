import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { Mail, MessageSquare, Phone, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Leads del asistente" };

type Search = { q?: string; days?: string; page?: string };

const PAGE_SIZE = 20;

function parseDays(raw: string | undefined): number {
  const value = Number(raw);
  return [7, 30, 90, 365].includes(value) ? value : 90;
}

/**
 * Contactos que dejaron sus datos en el asistente.
 *
 * Es una pantalla comercial: importa a quién llamar y por qué producto
 * preguntó. El análisis de lo que la gente consulta vive aparte, en
 * /admin/assistant/conversations, porque responde otra pregunta.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim();
  const days = parseDays(params.days);
  const page = Math.max(1, Number(params.page) || 1);
  const since = new Date(Date.now() - days * 86400000);

  const where: Prisma.ExpoLeadWhereInput = {
    createdAt: { gte: since },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { projectInfo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, total, withEmail, withPhone, withProject] = await Promise.all([
    prisma.expoLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { session: { select: { id: true, surface: true, questionCount: true } } },
    }),
    prisma.expoLead.count({ where }),
    prisma.expoLead.count({ where: { createdAt: { gte: since }, email: { not: null } } }),
    prisma.expoLead.count({ where: { createdAt: { gte: since }, phone: { not: null } } }),
    prisma.expoLead.count({ where: { createdAt: { gte: since }, projectInfo: { not: null } } }),
  ]);

  // Los productos que consultó cada contacto, en una sola consulta.
  const productIds = Array.from(
    new Set(
      leads.flatMap((lead) =>
        [lead.initialProductId, ...lead.productsOfInterest].filter((id): id is string => !!id)
      )
    )
  );
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, normalizedName: true, brand: { select: { name: true } } },
      })
    : [];
  const byId = new Map(products.map((product) => [product.id, product]));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    next.set("days", String(days));
    next.set("page", String(target));
    return `/admin/assistant/leads?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads del asistente"
        description="Visitantes que dejaron sus datos mientras consultaban el catálogo, del más reciente al más viejo."
        actions={
          <Link
            href="/admin/assistant/conversations"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary"
          >
            <MessageSquare className="h-4 w-4" />
            Ver conversaciones
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [total, `Contactos (${days} días)`],
          [withEmail, "Dejaron email"],
          [withPhone, "Dejaron teléfono"],
          [withProject, "Contaron su proyecto"],
        ].map(([value, label]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Nombre, empresa, email, teléfono o proyecto"
              className="min-w-[16rem] flex-1"
            />
            <Select name="days" defaultValue={String(days)} className="w-auto">
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="365">Último año</option>
            </Select>
            <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">Buscar</button>
          </form>
        </CardContent>
      </Card>

      {leads.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<UserPlus className="h-6 w-6" />}
              title="Todavía no hay contactos"
              description="Cuando un visitante deje su nombre o su mail en el asistente, va a aparecer acá con los productos que consultó."
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => {
            const interest = Array.from(
              new Set([lead.initialProductId, ...lead.productsOfInterest].filter((id): id is string => !!id))
            )
              .map((id) => byId.get(id))
              .filter((product): product is NonNullable<typeof product> => !!product)
              .slice(0, 6);
            const title = lead.name || lead.company || lead.email || lead.phone || "Contacto sin nombre";

            return (
              <li key={lead.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold">{title}</p>
                        {lead.company && lead.company !== title ? (
                          <p className="text-sm text-muted-foreground">{lead.company}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={lead.session.surface === "EXPO" ? "accent" : "primary"}>
                          {lead.session.surface === "EXPO" ? "Expo" : "Catálogo"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</span>
                      </div>
                    </div>

                    {lead.email || lead.phone ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                        {lead.email ? (
                          <a
                            className="inline-flex items-center gap-1.5 text-primary hover:underline"
                            href={`mailto:${lead.email}`}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {lead.email}
                          </a>
                        ) : null}
                        {lead.phone ? (
                          <a
                            className="inline-flex items-center gap-1.5 text-primary hover:underline"
                            href={`tel:${lead.phone}`}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {lead.phone}
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin datos de contacto.</p>
                    )}

                    {lead.projectInfo ? (
                      <p className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
                        {lead.projectInfo}
                      </p>
                    ) : null}

                    {interest.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Consultó:</span>
                        {interest.map((product) => (
                          <Link
                            key={product.id}
                            href={`/admin/products/${product.id}`}
                            className="rounded-full bg-secondary px-2.5 py-0.5 text-xs hover:bg-secondary/70"
                          >
                            {product.brand?.name ? `${product.brand.name} ` : ""}
                            {product.normalizedName}
                          </Link>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between border-t border-border pt-2.5">
                      <span className="text-xs text-muted-foreground">
                        {lead.session.questionCount}{" "}
                        {lead.session.questionCount === 1 ? "pregunta" : "preguntas"}
                      </span>
                      <Link
                        href={`/admin/assistant/conversations/${lead.sessionId}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Ver la conversación
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {pages} · {total} contactos
          </span>
          <div className="flex gap-3">
            {page > 1 ? (
              <Link className="hover:underline" href={pageHref(page - 1)}>
                Anterior
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="hover:underline" href={pageHref(page + 1)}>
                Siguiente
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
