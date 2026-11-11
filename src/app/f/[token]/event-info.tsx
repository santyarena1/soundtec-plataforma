"use client";

import { useState } from "react";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { mapDirectionsUrl, mapEmbedUrl, type AgendaItem, type InfoItem } from "@/lib/forms/types";
import type { FormTheme } from "./form-theme";

/** Datos útiles en dos columnas: etiqueta chica arriba, dato grande abajo. */
export function InfoList({ items, theme }: { items: InfoItem[]; theme: FormTheme }) {
  const rows = items.filter((i) => i.label.trim() || i.value.trim());
  if (!rows.length) return null;
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {rows.map((item, i) => (
        <div key={i} className={`border-l-2 pl-4 ${theme.dark ? "border-white/30" : "border-black/10"}`}>
          <dt className={`text-xs font-semibold uppercase tracking-[0.14em] ${theme.muted}`}>{item.label}</dt>
          <dd className="mt-1 whitespace-pre-line text-lg font-medium leading-snug">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Programa del evento: línea de tiempo con la hora a la izquierda. */
export function AgendaList({ items, theme }: { items: AgendaItem[]; theme: FormTheme }) {
  const rows = items.filter((i) => i.time.trim() || i.title.trim());
  if (!rows.length) return null;
  return (
    <ol className="relative">
      {rows.map((item, i) => (
        <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-4 sm:grid-cols-[5.5rem_1fr]">
          <span className="pt-0.5 text-lg font-semibold tabular-nums">{item.time}</span>
          <div className={`relative border-l-2 pl-5 ${i === rows.length - 1 ? "" : "pb-5"} ${theme.dark ? "border-white/25" : "border-black/10"}`}>
            <span className={`absolute -left-[7px] top-2 h-3 w-3 rounded-full ${theme.bar}`} aria-hidden />
            <p className="text-lg font-medium leading-snug">{item.title}</p>
            {item.detail ? <p className={`mt-0.5 text-base ${theme.muted}`}>{item.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Mapa embebido con «Cómo llegar» (recorrido desde donde esté la persona) y «Abrir en Google Maps». */
export function MapPanel({
  query,
  openUrl,
  theme,
  tall,
  directions: withDirections = true,
}: {
  query: string;
  openUrl?: string | null;
  theme: FormTheme;
  tall?: boolean;
  /** En la pantalla de mapa del formulario va sin «Cómo llegar», para que no se vayan antes de enviar. */
  directions?: boolean;
}) {
  const embed = mapEmbedUrl(query);
  const directions = withDirections ? mapDirectionsUrl(query) : null;
  return (
    <div>
      {embed ? <MapFrame src={embed} tall={tall} dark={theme.dark} /> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {directions ? (
          <a href={directions} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold shadow-md transition hover:-translate-y-0.5 ${theme.button}`}>
            <Navigation className="h-4 w-4" /> Cómo llegar
          </a>
        ) : null}
        {openUrl ? (
          <a href={openUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 font-semibold ${theme.choice}`}>
            <MapPin className="h-4 w-4" /> Abrir en Google Maps <ExternalLink className="h-4 w-4 opacity-60" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** Mapa de Google con un aviso mientras carga (en lugar de un recuadro en blanco). */
function MapFrame({ src, tall, dark }: { src: string; tall?: boolean; dark: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl shadow-2xl ${tall ? "h-[50vh] min-h-[320px]" : "h-72"} ${dark ? "bg-white/5" : "bg-black/[0.04]"}`}>
      {!loaded ? (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm ${dark ? "text-white/60" : "text-black/45"}`}>
          <MapPin className="h-6 w-6 animate-bounce" />
          Cargando mapa…
        </div>
      ) : null}
      <iframe
        src={src}
        title="Mapa"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/**
 * Precarga invisible del mapa que viene: así, al llegar a esa pantalla, Google
 * ya tiene su código y las imágenes en caché y el mapa aparece mucho antes.
 */
export function MapPreload({ query }: { query: string }) {
  const src = mapEmbedUrl(query);
  if (!src) return null;
  return <iframe src={src} title="" aria-hidden tabIndex={-1} className="pointer-events-none fixed -left-[9999px] top-0 h-[400px] w-[600px] opacity-0" />;
}
