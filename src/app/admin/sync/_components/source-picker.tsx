export const SYNC_SOURCES = [
  { slug: "crestron", name: "Crestron (Xtrabone) — precios y stock", hint: "Precios, disponibilidad y logística desde Xtrabone. No toca contenido." },
  { slug: "crestron-web", name: "Crestron.com — enriquecimiento", hint: "Fichas, especificaciones, imágenes y documentos. No toca precios ni stock." },
  { slug: "sonance", name: "Sonance / IPORT / JAMES / BLAZE", hint: "Catálogo, contenido, imágenes y relaciones." },
] as const;
export type SourceSlug = (typeof SYNC_SOURCES)[number]["slug"];

export function SourcePicker({ value, disabled, onChange }: { value: SourceSlug; disabled: boolean; onChange: (value: SourceSlug) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">{SYNC_SOURCES.map((item) => (
    <button key={item.slug} type="button" onClick={() => onChange(item.slug)} disabled={disabled}
      className={`rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-60 ${value === item.slug ? "border-primary bg-primary/8 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}>
      <p className="text-sm font-medium">{item.name}</p><p className="mt-0.5 text-xs">{item.hint}</p>
    </button>
  ))}</div>;
}
