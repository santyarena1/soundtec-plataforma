/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, Mail, Phone } from "lucide-react";
import { PublicFooter } from "@/components/layout/public-footer";
import { getCompanyIdentity } from "@/lib/quote-defaults";
import { ogImageUrl, ogMeta } from "@/lib/og/meta";
import { countShareView, findSharedProject } from "@/server/room-builder/share";
import { loadPublicProject, type PublicRoom } from "@/server/room-builder/public-project";
import { PORTS_SOURCE_LABEL } from "@/services/room-builder/sheets/sheet-model";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const project = await findSharedProject(params.token).catch(() => null);
  if (!project) return { title: "Proyecto", robots: { index: false, follow: false } };
  return {
    title: project.name,
    robots: { index: false, follow: false },
    // Tarjeta al pegar el enlace: nombre del proyecto con la estética del sitio, sin precios.
    ...ogMeta({ title: project.name, description: "Planos, diagrama de conexiones y equipos del proyecto, preparados por Soundtec.", image: ogImageUrl(`/api/og/project/${params.token}`, project.updatedAt) }),
  };
}

const m1 = (n: number) => n.toFixed(1).replace(".", ",");

function RoomSection({ room, index }: { room: PublicRoom; index: number }) {
  return (
    <section id={`sala-${index + 1}`} className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
        <div>
          <h2 className="text-xl font-semibold">{room.name}</h2>
          <p className="text-sm text-muted-foreground">
            {m1(room.dims.widthM)} × {m1(room.dims.depthM)} m · alto {m1(room.dims.heightM)} m · {room.devices.length} equipos · {room.cables} cables ({m1(room.meters)} m)
          </p>
        </div>
        {room.source === "auto" ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Conexiones propuestas, a confirmar en obra</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <figure className="rounded-xl border border-border bg-white p-3">
          <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plano a escala</figcaption>
          {room.planSvg ? <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: room.planSvg }} /> : <p className="py-10 text-center text-sm text-muted-foreground">Plano en preparación.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Cotas en metros. Los números corresponden a la lista de equipos; las líneas de color, a los cables (punteadas: largo estimado).</p>
        </figure>
        <figure className="flex min-w-0 flex-col rounded-xl border border-border bg-white p-3">
          <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diagrama de conexiones</figcaption>
          {room.diagramSvg ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100 [&_svg]:max-w-none" style={{ maxHeight: 620 }} dangerouslySetInnerHTML={{ __html: room.diagramSvg }} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Sin cableado trazado todavía.</p>
          )}
          {room.diagramSvg ? <p className="mt-2 text-xs text-muted-foreground">Deslizá para recorrer el diagrama completo.</p> : null}
        </figure>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Equipos</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {room.devices.map((d, i) => (
            <li key={`${d.n}-${i}`} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-lg bg-white">
                {d.image ? <img src={d.image} alt={d.model} className="max-h-full max-w-full object-contain" loading="lazy" referrerPolicy="no-referrer" /> : <span className="text-2xl font-bold text-slate-300">{d.n}</span>}
              </div>
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-1.5">
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1e3553] px-1 text-[11px] font-bold text-white">{d.n}</span>
                  <span className="truncate text-xs text-muted-foreground">{d.brand || "Genérico"}</span>
                </p>
                <p className="mt-0.5 font-medium leading-snug">
                  {d.model}
                  {d.quantity > 1 ? <span className="text-muted-foreground"> × {d.quantity}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{d.location}</p>
                {d.ports !== "ficha" ? <p className="mt-1 text-[11px] font-medium text-amber-800">{PORTS_SOURCE_LABEL[d.ports]}: conexiones a confirmar</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function SharedProjectPage({ params }: { params: { token: string } }) {
  const project = await findSharedProject(params.token);
  if (!project) notFound();
  countShareView(project.id);
  const [data, identity] = await Promise.all([loadPublicProject(project.id), getCompanyIdentity()]);
  const mailto = `mailto:${identity.email}?subject=${encodeURIComponent(`Proyecto · ${data.name}`)}`;
  const tel = `tel:${identity.phone.replace(/[^\d+]/g, "")}`;
  const totals = { devices: data.rooms.reduce((a, r) => a + r.devices.length, 0), cables: data.rooms.reduce((a, r) => a + r.cables, 0) };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <img src="/landing/logo_soundtec.png" alt="Soundtec" className="h-10 w-auto" />
          <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">Soundtec · Proyecto</p>
          <h1 className="heading-2 mt-1 text-2xl sm:text-3xl">{data.name}</h1>
          <p className="muted-text mt-2">
            {data.clientName ? `${data.clientName} · ` : ""}
            {data.rooms.length === 1 ? "1 sala" : `${data.rooms.length} salas`} · {totals.devices} equipos · {totals.cables} cables
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={`/p/${params.token}/laminas`} className="inline-flex items-center gap-2 rounded-lg bg-[#1e3553] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16283f]">
              <Download className="h-4 w-4" /> Descargar láminas PDF
            </a>
            <a href={mailto} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <Mail className="h-4 w-4" /> Contactar a Soundtec
            </a>
            <a href={tel} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Phone className="h-4 w-4" /> {identity.phone}
            </a>
          </div>
          {project.expiresAt ? <p className="mt-3 text-xs text-muted-foreground">Enlace disponible hasta el {project.expiresAt.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" })}.</p> : null}
          {data.rooms.length > 1 ? (
            <nav aria-label="Salas del proyecto" className="mt-5 flex flex-wrap gap-2">
              {data.rooms.map((r, i) => (
                <a key={r.id} href={`#sala-${i + 1}`} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-[#1e3553] hover:text-[#1e3553]">
                  {r.name}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 py-8 sm:px-6">
        {data.rooms.length ? data.rooms.map((r, i) => <RoomSection key={r.id} room={r} index={i} />) : <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">El proyecto todavía no tiene salas cargadas.</p>}
        <p className="text-center text-xs text-muted-foreground">Documento técnico de referencia, sin precios. Las medidas finales se confirman en el relevamiento de obra.</p>
      </main>
      <PublicFooter />
    </div>
  );
}
