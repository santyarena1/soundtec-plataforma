import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  ArrowRight,
  Speaker,
  Tv,
  Lightbulb,
  Network,
  Headphones,
  Building2,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getLandingData() {
  try {
    const [hero, posts, brands] = await Promise.all([
      prisma.landingHero.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.landingPost.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: "desc" },
        take: 6,
      }),
      prisma.brand.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        take: 16,
      }),
    ]);
    return { hero, posts, brands };
  } catch (error) {
    console.warn("Landing data fallback (¿DB no inicializada?):", error);
    return {
      hero: null as Awaited<ReturnType<typeof prisma.landingHero.findFirst>>,
      posts: [] as Awaited<ReturnType<typeof prisma.landingPost.findMany>>,
      brands: [] as Awaited<ReturnType<typeof prisma.brand.findMany>>,
    };
  }
}

const solutions = [
  {
    icon: Speaker,
    title: "Audio profesional",
    description: "Refuerzo sonoro, microfonía, mezcla, distribución y procesamiento DSP.",
  },
  {
    icon: Tv,
    title: "Video y broadcast",
    description: "Displays, videowalls, switchers, cámaras PTZ y producción multicámara.",
  },
  {
    icon: Headphones,
    title: "Videoconferencia",
    description: "Salas híbridas con soluciones nativas para Teams, Zoom y Google Meet.",
  },
  {
    icon: Lightbulb,
    title: "Iluminación",
    description: "Iluminación arquitectónica, escénica y de eventos con control DMX/Art-Net.",
  },
  {
    icon: Network,
    title: "Automatización y control",
    description: "Sistemas Crestron, Extron y Q-SYS para experiencias unificadas.",
  },
  {
    icon: Building2,
    title: "Proyectos llave en mano",
    description: "Asesoramiento, diseño, ingeniería, instalación y soporte continuo.",
  },
];

export default async function HomePage() {
  const { hero, posts, brands } = await getLandingData();

  return (
    <>
      <PublicNavbar />

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-secondary/40 via-background to-background">
          <div className="container-page grid gap-12 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-28">
            <div>
              <Badge tone="accent" className="mb-5">
                Soundtec · Portal B2B
              </Badge>
              <h1 className="heading-1 text-balance text-4xl leading-tight sm:text-5xl lg:text-6xl">
                {hero?.title || "Soluciones audiovisuales integradas, ejecutadas con criterio profesional."}
              </h1>
              <p className="muted-text mt-5 max-w-xl text-base">
                {hero?.subtitle ||
                  "Audio, video, iluminación, videoconferencia, automatización y control inteligente para proyectos corporativos, educativos, culturales y de eventos."}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href={hero?.ctaUrl || "/login"} size="lg">
                  {hero?.ctaText || "Acceder al portal"} <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <Link
                  href="#soluciones"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Conocer soluciones
                </Link>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Sectores</dt>
                  <dd className="mt-1 font-semibold">Corporativo · Educación · Cultural</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Operación</dt>
                  <dd className="mt-1 font-semibold">Argentina</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Modalidad</dt>
                  <dd className="mt-1 font-semibold">Distribución · Integración</dd>
                </div>
              </dl>
            </div>

            <div className="relative">
              <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent blur-3xl" />
              <div className="rounded-2xl border border-border bg-card p-2 shadow-elevated">
                <div className="rounded-xl bg-primary p-8 text-primary-foreground">
                  <p className="text-xs uppercase tracking-widest text-primary-foreground/70">
                    Portal de clientes
                  </p>
                  <p className="mt-2 text-2xl font-semibold leading-tight">
                    Listas de precios, configuraciones y solicitudes en un solo lugar.
                  </p>
                  <ul className="mt-6 space-y-2 text-sm text-primary-foreground/80">
                    <li>· Precios en USD con descuentos personalizados.</li>
                    <li>· Productos configurables y accesorios.</li>
                    <li>· Solicitudes de presupuesto trazables.</li>
                    <li>· Soporte y asesoramiento técnico directo.</li>
                  </ul>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 text-xs">
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-muted-foreground">Productos</p>
                    <p className="text-base font-semibold">+ catálogo vivo</p>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-muted-foreground">Marcas</p>
                    <p className="text-base font-semibold">premium</p>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-muted-foreground">Respuesta</p>
                    <p className="text-base font-semibold">24-48 hs</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SOLUCIONES */}
        <section id="soluciones" className="container-page py-20">
          <div className="max-w-2xl">
            <Badge tone="primary">Soluciones</Badge>
            <h2 className="heading-2 mt-3 text-3xl">Un partner técnico para cada parte del proyecto.</h2>
            <p className="muted-text mt-3">
              Cubrimos desde el asesoramiento inicial hasta la puesta en marcha, capacitación y soporte de los sistemas
              audiovisuales más exigentes.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {solutions.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="transition-shadow hover:shadow-elevated">
                <CardContent className="space-y-3 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* MARCAS */}
        <section id="marcas" className="border-y border-border bg-secondary/30 py-16">
          <div className="container-page">
            <div className="flex items-end justify-between">
              <div>
                <Badge tone="primary">Marcas</Badge>
                <h2 className="heading-2 mt-3 text-3xl">Trabajamos con marcas líderes del sector.</h2>
              </div>
              <p className="muted-text hidden max-w-md text-right md:block">
                El listado completo de marcas y productos disponibles para tu cuenta se encuentra dentro del portal.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {brands.length === 0 ? (
                <p className="muted-text col-span-full">Próximamente listaremos las marcas asociadas.</p>
              ) : (
                brands.map((brand) => (
                  <div
                    key={brand.id}
                    className="flex items-center justify-center rounded-md border border-border bg-card px-3 py-4 text-center text-sm font-medium text-foreground"
                  >
                    {brand.name}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* NOVEDADES */}
        <section id="novedades" className="container-page py-20">
          <div className="flex items-end justify-between">
            <div>
              <Badge tone="primary">Novedades</Badge>
              <h2 className="heading-2 mt-3 text-3xl">Últimas notas del equipo Soundtec.</h2>
            </div>
            <Link href="/login" className="hidden text-sm font-medium text-accent hover:underline md:inline-flex">
              Acceder al portal completo
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.length === 0 ? (
              <p className="muted-text col-span-full">Estamos preparando las primeras publicaciones.</p>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="overflow-hidden">
                  {post.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.coverImageUrl}
                      alt={post.title}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="h-40 w-full bg-gradient-to-br from-primary/80 to-accent/80" />
                  )}
                  <CardContent className="space-y-2 p-6">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {formatDate(post.publishedAt || post.createdAt)}
                    </p>
                    <CardTitle>{post.title}</CardTitle>
                    {post.excerpt ? <CardDescription>{post.excerpt}</CardDescription> : null}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* CTA */}
        <section id="contacto" className="container-page pb-24">
          <div className="overflow-hidden rounded-2xl bg-primary p-10 text-primary-foreground sm:p-14">
            <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr] sm:items-center">
              <div>
                <h2 className="text-2xl font-semibold sm:text-3xl">
                  ¿Sos cliente Soundtec? Ingresá al portal y operá tu cuenta.
                </h2>
                <p className="mt-3 max-w-xl text-primary-foreground/80">
                  Si todavía no tenés acceso, contactanos. Las cuentas se habilitan manualmente por nuestro equipo.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 sm:justify-end">
                <ButtonLink href="/login" size="lg" variant="secondary">
                  Iniciar sesión
                </ButtonLink>
                <a
                  href="mailto:contacto@soundtec.com.ar"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-primary-foreground/30 px-6 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/10"
                >
                  Pedir acceso
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
