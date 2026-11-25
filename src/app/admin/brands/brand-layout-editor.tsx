"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { DEFAULT_BRAND_GROUPS, brandKey, type BrandGroupConfig, type BrandGroupsConfig } from "@/lib/brand-layout";
import { saveBrandGroups } from "@/server/actions/brand-layout";

const MAX_PER_GROUP = 12;

/** Mueve un elemento de una lista sin tocar la original. */
function moved<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Grupos de marcas del catálogo. Cada grupo es una marca principal y sus
 * hermanas; el orden de la lista es el orden en el catálogo. Con eso se arman
 * solos el menú de marcas y la barra de arriba del listado.
 */
export function BrandLayoutEditor({ initial, brandNames }: { initial: BrandGroupsConfig; brandNames: string[] }) {
  const [groups, setGroups] = useState<BrandGroupConfig[]>(initial.groups);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const tracker = useUnsavedValue(groups);

  const known = new Set(brandNames.map(brandKey));
  const placed = new Set(groups.flatMap((g) => g.brands.map(brandKey)));
  const loose = brandNames.filter((name) => !placed.has(brandKey(name)));

  const update = (next: BrandGroupConfig[]) => {
    setGroups(next);
    setStatus(null);
  };
  const patch = (index: number, change: Partial<BrandGroupConfig>) => update(groups.map((g, i) => (i === index ? { ...g, ...change } : g)));
  const canonical = (name: string) => brandNames.find((x) => brandKey(x) === brandKey(name)) ?? name.trim();

  const addTo = (index: number) => {
    const name = (draft[index] ?? "").trim();
    const group = groups[index];
    if (!name || group.brands.length >= MAX_PER_GROUP) return;
    // Una marca va en un solo grupo: si estaba en otro, se mueve acá.
    const key = brandKey(name);
    const without = groups.map((g, i) => (i === index ? g : { ...g, brands: g.brands.filter((b) => brandKey(b) !== key) }));
    const target = without[index];
    if (target.brands.some((b) => brandKey(b) === key)) return;
    update(without.map((g, i) => (i === index ? { ...g, brands: [...g.brands, canonical(name)] } : g)).filter((g, i) => i === index || g.brands.length));
    setDraft({ ...draft, [index]: "" });
  };

  const save = (value: BrandGroupsConfig | null) => {
    setStatus(null);
    start(async () => {
      const result = await saveBrandGroups(value);
      if (!result.ok) return setStatus({ tone: "error", text: result.error });
      const saved = (value ?? DEFAULT_BRAND_GROUPS).groups;
      setGroups(saved);
      tracker.markSaved(saved);
      setStatus({ tone: "ok", text: value ? "Grupos guardados. Ya se ven en el catálogo." : "Volvió al armado del boceto." });
    });
  };

  return (
    <div className="space-y-4">
      <datalist id="brand-group-names">
        {brandNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <ol className="divide-y divide-border rounded-lg border border-border">
        {groups.map((group, index) => (
          <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <span className="w-5 text-right text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
            <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {group.brands.map((name, i) => {
                const isKnown = known.has(brandKey(name));
                return (
                  <li
                    key={name}
                    title={isKnown ? undefined : "No está cargada: se muestra como «Próximamente»"}
                    className={
                      i === 0
                        ? "inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 py-1 pl-2.5 pr-1 text-sm font-semibold"
                        : "inline-flex items-center gap-1 rounded-md border border-border bg-background py-0.5 pl-2 pr-1 text-xs"
                    }
                  >
                    <span className={isKnown ? "" : "italic text-muted-foreground"}>{name}</span>
                    {i === 0 && group.brands.length > 1 ? <span className="text-[10px] font-medium uppercase tracking-wide text-primary/70">principal</span> : null}
                    {i > 0 ? (
                      <button type="button" title="Hacerla principal" className="px-0.5 text-muted-foreground hover:text-foreground" onClick={() => patch(index, { brands: [name, ...group.brands.filter((_, j) => j !== i)] })}>
                        ★
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Quitar ${name}`}
                      className="px-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const brands = group.brands.filter((_, j) => j !== i);
                        update(brands.length ? groups.map((g, k) => (k === index ? { ...g, brands } : g)) : groups.filter((_, k) => k !== index));
                      }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
              {group.brands.length < MAX_PER_GROUP ? (
                <li className="flex items-center gap-1">
                  <input
                    list="brand-group-names"
                    data-unsaved-guard="ignore"
                    aria-label="Sumar marca al grupo"
                    value={draft[index] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [index]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTo(index);
                      }
                    }}
                    placeholder={group.brands.length ? "+ hermana" : "Marca principal"}
                    className="h-7 w-32 rounded-md border border-dashed border-border bg-transparent px-2 text-xs focus:border-solid"
                  />
                </li>
              ) : null}
            </ul>
            {group.brands.length > 1 ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="En la barra del listado cada marca aparece por su cuenta (como Crestron y Crestron Home)">
                <input type="checkbox" checked={group.separate ?? false} onChange={(e) => patch(index, { separate: e.target.checked || undefined })} />
                Separadas en la barra
              </label>
            ) : null}
            <div className="flex items-center">
              <IconButton label="Subir" disabled={index === 0} onClick={() => update(moved(groups, index, -1))} icon={<ArrowUp className="h-3.5 w-3.5" />} />
              <IconButton label="Bajar" disabled={index === groups.length - 1} onClick={() => update(moved(groups, index, 1))} icon={<ArrowDown className="h-3.5 w-3.5" />} />
              <IconButton label="Quitar grupo" onClick={() => update(groups.filter((_, k) => k !== index))} icon={<Trash2 className="h-3.5 w-3.5" />} />
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => update([...groups, { brands: [] }])}>
          <Plus className="h-3.5 w-3.5" /> Nuevo grupo
        </Button>
        {loose.length ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Sin grupo (van al final, en «Más marcas»):</span>
            {loose.map((name) => (
              <button
                key={name}
                type="button"
                title="Sumarla como grupo propio al final"
                onClick={() => update([...groups, { brands: [name] }])}
                className="rounded-md border border-border bg-background px-2 py-0.5 text-foreground hover:border-primary/40"
              >
                + {name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" onClick={() => save({ groups: groups.filter((g) => g.brands.length) })} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Guardar grupos
        </Button>
        <Button size="sm" variant="ghost" onClick={() => save(null)} disabled={pending}>
          Volver al boceto original
        </Button>
        {status ? <span className={status.tone === "ok" ? "text-xs text-emerald-700" : "text-xs text-destructive"}>{status.text}</span> : null}
      </div>
    </div>
  );
}

function IconButton({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
    >
      {icon}
    </button>
  );
}
