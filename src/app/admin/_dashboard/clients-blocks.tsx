import Link from "next/link";
import { Phone, Search, SearchX } from "lucide-react";
import { loadCallList, loadPortalActivity, loadProductInterest, ACTIVITY_DAYS, INACTIVE_DAYS } from "@/server/dashboard/activity";
import type { DashboardViewer } from "@/server/dashboard/viewer";
import { BlockError, Count, Panel, Quiet, SubHead, shortDate, timeOrDate } from "./ui";

const clientHref = (id: string | null) => (id ? `/admin/clients/${id}` : "/admin/users?vista=portal");

/** «Para llamar»: los que se mueven en el portal y no tienen cotización abierta. */
export async function CallBlock({ viewer, className }: { viewer: DashboardViewer; className?: string }) {
  let list: Awaited<ReturnType<typeof loadCallList>>;
  try {
    list = await loadCallList(viewer);
  } catch (error) {
    console.error("[dashboard] para llamar", error);
    return <BlockError title="Para llamar" className={className} />;
  }
  return (
    <Panel eyebrow={`Clientes · últimos ${ACTIVITY_DAYS} días`} title="Para llamar" className={className} tour="dash-call">
      <p className="-mt-1 mb-3 text-xs text-muted-foreground">
        {viewer.clientsAll ? "Empresas" : "Tus clientes"} con movimiento en el portal y sin una cotización abierta.
      </p>
      {list.length === 0 ? (
        <Quiet>Nadie con movimiento fuerte sin cotización abierta. Buena señal: lo que se mueve ya está cotizado.</Quiet>
      ) : (
        <ol className="space-y-2">
          {list.map((c, i) => (
            <li key={c.clientId}>
              <Link
                href={`/admin/clients/${c.clientId}`}
                className="group flex gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-secondary/50"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium group-hover:text-accent">{c.companyName}</span>
                    {viewer.clientsAll && c.ownerName ? <span className="shrink-0 text-xs text-muted-foreground">{c.ownerName}</span> : null}
                  </span>
                  <span className="block text-xs leading-relaxed text-muted-foreground first-letter:uppercase">{c.reasons.join(" · ")}</span>
                </span>
                <Phone className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Quién entró, quién dejó de entrar, favoritos y preguntas a Soundtec AI. */
export async function PortalBlock({ viewer, className }: { viewer: DashboardViewer; className?: string }) {
  let data: Awaited<ReturnType<typeof loadPortalActivity>>;
  try {
    data = await loadPortalActivity(viewer);
  } catch (error) {
    console.error("[dashboard] portal", error);
    return <BlockError title="Clientes en el portal" className={className} />;
  }
  if (!data) return null;
  const now = new Date();
  return (
    <Panel eyebrow="Portal" title={viewer.clientsAll ? "Clientes en el portal" : "Tus clientes en el portal"} action={{ href: "/admin/users?vista=portal", label: "Usuarios" }} className={className}>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Entraron hoy", value: data.loggedTodayCount },
          { label: `En ${ACTIVITY_DAYS} días`, value: data.loggedWeekCount },
          { label: `+${INACTIVE_DAYS} días sin entrar`, value: data.inactiveCount, warn: data.inactiveCount > 0 },
        ].map((k) => (
          <div key={k.label} className="rounded-md bg-secondary/60 px-3 py-2">
            <p className={`text-xl font-semibold leading-tight tabular-nums ${k.warn ? "text-warning" : ""}`}>
              <Count value={k.value} />
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <SubHead>Entraron hoy</SubHead>
      {data.loggedToday.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {data.loggedToday.map((p) => (
            <li key={p.userId}>
              <Link href={clientHref(p.clientId)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:border-accent/40 hover:text-accent">
                <span className="font-medium">{p.company || p.name}</span>
                <span className="text-muted-foreground">{timeOrDate(p.at, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>Hoy todavía no entró nadie.</Quiet>
      )}

      {data.inactive.length ? (
        <>
          <SubHead aside="último ingreso">Dejaron de entrar</SubHead>
          <ul className="space-y-1 text-sm">
            {data.inactive.map((c) => (
              <li key={c.clientId} className="flex items-baseline justify-between gap-2">
                <Link href={`/admin/clients/${c.clientId}`} className="truncate hover:text-accent hover:underline">{c.company}</Link>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shortDate(c.lastLoginAt)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <SubHead>Favoritos recientes</SubHead>
      {data.favorites.length ? (
        <ul className="space-y-1.5 text-sm">
          {data.favorites.map((f) => (
            <li key={f.id} className="min-w-0">
              <Link href={`/admin/products/${f.productId}`} className="block truncate font-medium hover:text-accent hover:underline">{f.product}</Link>
              <span className="block truncate text-xs text-muted-foreground">
                {f.company || f.person} · {timeOrDate(f.at, now)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>Nadie guardó favoritos en los últimos 30 días.</Quiet>
      )}

      <SubHead>Preguntas a Soundtec AI</SubHead>
      {data.questions.length ? (
        <ul className="space-y-2">
          {data.questions.map((q) => (
            <li key={q.id} className="border-l-2 border-accent/30 pl-2.5">
              <p className="text-sm leading-snug">«{q.text}»</p>
              <Link href={clientHref(q.clientId)} className="text-xs text-muted-foreground hover:text-accent">
                {q.company || q.person} · {timeOrDate(q.at, now)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>Sin preguntas de clientes identificados en los últimos 30 días. Se registran desde esta versión.</Quiet>
      )}
    </Panel>
  );
}

/** Qué miran y qué buscan (portal y /catalogo). */
export async function InterestBlock({ viewer, className }: { viewer: DashboardViewer; className?: string }) {
  let data: Awaited<ReturnType<typeof loadProductInterest>>;
  try {
    data = await loadProductInterest(viewer);
  } catch (error) {
    console.error("[dashboard] interés", error);
    return <BlockError title="Qué miran y qué buscan" className={className} />;
  }
  const maxVisitors = Math.max(1, ...data.topViewed.map((p) => p.visitors));
  return (
    <Panel eyebrow={`Catálogo · últimos ${ACTIVITY_DAYS} días`} title="Qué miran y qué buscan" className={className} tour="dash-interest">
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        <div className="min-w-0 md:row-span-2">
          <SubHead aside="personas distintas">Fichas más vistas</SubHead>
          {data.topViewed.length ? (
            <ol className="space-y-2.5">
              {data.topViewed.map((p) => (
                <li key={p.productId} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/admin/products/${p.productId}`} className="truncate text-sm font-medium hover:text-accent hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{p.visitors}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.max(6, (p.visitors / maxVisitors) * 100)}%` }} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.brand ?? "Sin marca"}
                    {p.clients.length ? (
                      <>
                        {" · "}
                        {p.clients.map((c, i) => (
                          <span key={c.id}>
                            {i ? ", " : ""}
                            <Link href={`/admin/clients/${c.id}`} className="text-foreground/80 hover:text-accent hover:underline">{c.company}</Link>
                          </span>
                        ))}
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <Quiet>Nadie abrió fichas esta semana.</Quiet>
          )}
        </div>

        <div className="min-w-0">
          <SubHead aside={data.totalSearches ? `${data.totalSearches.toLocaleString("es-AR")} búsquedas` : undefined}>Lo más buscado</SubHead>
          {data.topSearches.length ? (
            <ul className="space-y-1">
              {data.topSearches.map((s) => (
                <li key={s.query} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/portal/products?q=${encodeURIComponent(s.query)}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-accent">
                    <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.query}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {s.people} {s.people === 1 ? "persona" : "personas"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>Todavía no hay búsquedas registradas. Se cuentan desde esta versión.</Quiet>
          )}
        </div>

        <div className="min-w-0">
          <SubHead>Búsquedas sin resultados</SubHead>
          {data.zeroResults.length ? (
            <>
              <ul className="space-y-1">
                {data.zeroResults.map((s) => (
                  <li key={s.query} className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <SearchX className="h-3 w-3 shrink-0 text-warning" />
                      <span className="truncate">{s.query}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">×{s.times}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Productos que piden y no tenemos cargados (o con otro nombre).</p>
            </>
          ) : (
            <Quiet>Todo lo que buscaron encontró algo.</Quiet>
          )}
        </div>
      </div>
    </Panel>
  );
}
