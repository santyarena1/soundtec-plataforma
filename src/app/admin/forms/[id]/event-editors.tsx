"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { mapEmbedUrl, type AgendaItem, type InfoItem } from "@/lib/forms/types";

const field = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60";
const label = "mb-1.5 block text-sm font-medium";

function move<T>(list: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function RowButtons({ onUp, onDown, onRemove, first, last }: { onUp: () => void; onDown: () => void; onRemove: () => void; first: boolean; last: boolean }) {
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" disabled={first} onClick={onUp} className="rounded p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Subir">
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" disabled={last} onClick={onDown} className="rounded p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Bajar">
        <ArrowDown className="h-4 w-4" />
      </button>
      <button type="button" onClick={onRemove} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Quitar">
        <X className="h-4 w-4" />
      </button>
    </span>
  );
}

const INFO_SUGGESTIONS = ["Dirección", "Fecha", "Horario", "Estacionamiento", "Vestimenta", "Contacto"];

/** Datos útiles de la confirmación: etiqueta + dato (Dirección, Fecha, Horario…). */
export function InfoEditor({ items, onChange }: { items: InfoItem[]; onChange: (items: InfoItem[]) => void }) {
  const set = (i: number, patch: Partial<InfoItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const unused = INFO_SUGGESTIONS.filter((s) => !items.some((it) => it.label.trim().toLowerCase() === s.toLowerCase()));
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <input autoComplete="off" maxLength={60} value={item.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Dirección" className={`${field} w-40 shrink-0 font-medium`} aria-label={`Dato ${i + 1}: título`} />
          <input autoComplete="off" maxLength={300} value={item.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Av. Alicia Moreau de Justo 1150, CABA" className={field} aria-label={`Dato ${i + 1}: valor`} />
          <RowButtons first={i === 0} last={i === items.length - 1} onUp={() => onChange(move(items, i, -1))} onDown={() => onChange(move(items, i, 1))} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        {unused.map((s) => (
          <button key={s} type="button" onClick={() => onChange([...items, { label: s, value: "" }])} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
            <Plus className="h-3 w-3" /> {s}
          </button>
        ))}
        <button type="button" onClick={() => onChange([...items, { label: "", value: "" }])} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
          <Plus className="h-3 w-3" /> Otro dato
        </button>
      </div>
    </div>
  );
}

/** Programa del evento: hora, qué pasa y un detalle opcional. */
export function AgendaEditor({ items, onChange }: { items: AgendaItem[]; onChange: (items: AgendaItem[]) => void }) {
  const set = (i: number, patch: Partial<AgendaItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <input autoComplete="off" maxLength={20} value={item.time} onChange={(e) => set(i, { time: e.target.value })} placeholder="19:30" className={`${field} w-24 shrink-0 text-center font-semibold tabular-nums`} aria-label={`Momento ${i + 1}: hora`} />
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
            <input autoComplete="off" maxLength={200} value={item.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Demo en vivo" className={`${field} font-medium`} aria-label={`Momento ${i + 1}: qué pasa`} />
            <input autoComplete="off" maxLength={500} value={item.detail ?? ""} onChange={(e) => set(i, { detail: e.target.value || undefined })} placeholder="Detalle (opcional)" className={field} aria-label={`Momento ${i + 1}: detalle`} />
          </div>
          <RowButtons first={i === 0} last={i === items.length - 1} onUp={() => onChange(move(items, i, -1))} onDown={() => onChange(move(items, i, 1))} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { time: "", title: "" }])} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground">
        <Plus className="h-4 w-4" /> Agregar horario
      </button>
    </div>
  );
}

/** Enlace de Google Maps (el de «Compartir») o una dirección, con vista previa del mapa. */
export function MapLinkField({ value, resolved, onChange, heading = "Enlace de Google Maps o dirección" }: { value: string; resolved?: string; onChange: (value: string) => void; heading?: string }) {
  const embed = mapEmbedUrl(resolved || value);
  const shortLink = /^https?:\/\/(maps\.app\.)?goo\.gl\//i.test(value.trim());
  return (
    <div className="space-y-2">
      <label className={label}>{heading}</label>
      <input autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} className={field} placeholder="https://maps.app.goo.gl/…  o  Av. Alicia Moreau de Justo 1150, CABA" />
      <p className="text-xs text-muted-foreground">En Google Maps: buscá el lugar → Compartir → Copiar vínculo, y pegalo acá. Se muestra el mapa con el botón «Cómo llegar».</p>
      {embed ? (
        <iframe src={embed} title="Vista del mapa" className="h-56 w-full rounded-lg border border-border" loading="lazy" />
      ) : shortLink ? (
        <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">Enlace corto de Google Maps: el mapa se arma al guardar y se ve en el formulario y en la vista previa.</p>
      ) : value.trim() ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">No reconozco ese enlace. Pegá el de Compartir de Google Maps o escribí la dirección.</p>
      ) : null}
    </div>
  );
}
