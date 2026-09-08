/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

interface Post {
  id: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

export const CONTACT = {
  email: "info@soundtec.com.ar",
  phone: "(+54 11) 4586-0400",
  phoneHref: "tel:+541145860400",
  address: "Av. Donato Álvarez 1526, CABA, Argentina",
} as const;

export function News({ posts }: { posts: Post[] }) {
  if (posts.length === 0) return null;
  return (
    <section id="novedades" className="container-page py-20 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Novedades</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Últimas notas del equipo.</h2>
        </div>
        <Link href="/login" className="hidden text-sm font-medium text-accent hover:underline md:inline-flex">
          Ver todo en el portal
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Card key={post.id} className="overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-elevated">
            {post.coverImageUrl ? (
              <img src={post.coverImageUrl} alt={post.title} className="h-44 w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-44 w-full bg-gradient-to-br from-primary to-accent/80" />
            )}
            <CardContent className="space-y-2 p-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {formatDate(post.publishedAt || post.createdAt)}
              </p>
              <CardTitle>{post.title}</CardTitle>
              {post.excerpt ? <CardDescription>{post.excerpt}</CardDescription> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function AccessCta() {
  const subject = encodeURIComponent("Solicitud de acceso al portal Soundtec");
  const body = encodeURIComponent(
    "Hola, quiero una cuenta en el portal de clientes.\n\nEmpresa:\nCUIT:\nNombre y cargo:\nTeléfono:\nRubro / tipo de proyectos:\n"
  );
  return (
    <section id="acceso" className="container-page pb-24 pt-4">
      <div className="relative overflow-hidden rounded-3xl bg-primary p-8 text-primary-foreground sm:p-12 lg:p-16">
        <div className="landing-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/30 blur-3xl" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/60">Acceso</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              ¿Trabajás con Soundtec? Tu cuenta ya tiene un lugar acá.
            </h2>
            <p className="mt-4 max-w-xl text-primary-foreground/75">
              Las cuentas se habilitan a mano por nuestro equipo comercial, con las condiciones de tu empresa ya
              cargadas. Si todavía no tenés acceso, pedilo y te respondemos dentro de las 24–48 hs hábiles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/login" size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                Iniciar sesión <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <a
                href={`mailto:${CONTACT.email}?subject=${subject}&body=${body}`}
                className="inline-flex h-11 items-center justify-center rounded-md border border-primary-foreground/30 px-6 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/10"
              >
                Pedir una cuenta
              </a>
            </div>
          </div>

          <ul className="grid gap-3 text-sm">
            <li className="flex items-start gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-4">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs uppercase tracking-wider text-primary-foreground/55">Teléfono</p>
                <a href={CONTACT.phoneHref} className="font-medium hover:underline">
                  {CONTACT.phone}
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-4">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs uppercase tracking-wider text-primary-foreground/55">Email</p>
                <a href={`mailto:${CONTACT.email}`} className="font-medium hover:underline">
                  {CONTACT.email}
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-4">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs uppercase tracking-wider text-primary-foreground/55">Showroom y oficinas</p>
                <p className="font-medium">{CONTACT.address}</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
