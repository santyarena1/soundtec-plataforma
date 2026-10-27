"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { CategoryTreePicker } from "@/components/admin/category-tree-picker";
import type { CategoryNode } from "@/lib/category-tree";
import { addCompatibilityRule, previewCompatibilityRule, removeCompatibilityRule } from "@/server/actions/compatibility-rules";

type RuleView = { id: string; label: string; count: number };

/**
 * «Compatible con»: en vez de vincular producto por producto, decir que este
 * producto va con todo un rubro, o solo con una marca o una línea de ese rubro.
 */
export function CompatibilityRulesPanel({
  productId,
  initialRules,
  nodes,
  brands,
  lines,
}: {
  productId: string;
  initialRules: RuleView[];
  nodes: CategoryNode[];
  brands: Array<{ id: string; name: string }>;
  lines: string[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [line, setLine] = useState("");
  const [preview, setPreview] = useState<{ count: number; examples: string[] } | null>(null);
  const [pending, start] = useTransition();
  const draft = { productId, categoryId: categoryId || null, brandId: brandId || null, line: line.trim() || null };
  const empty = !draft.categoryId && !draft.brandId && !draft.line;

  useEffect(() => {
    if (!adding || empty) return setPreview(null);
    const t = setTimeout(() => {
      void previewCompatibilityRule(draft).then((r) => setPreview(r.ok ? { count: r.count ?? 0, examples: r.examples ?? [] } : null));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, categoryId, brandId, line]);

  function save() {
    start(async () => {
      const r = await addCompatibilityRule(draft);
      if (!r.ok) return void toast.error(r.error || "No se pudo guardar.");
      setRules(r.rules ?? []);
      setAdding(false);
      setCategoryId("");
      setBrandId("");
      setLine("");
      toast.success("Guardado.");
    });
  }

  function remove(id: string) {
    start(async () => {
      const r = await removeCompatibilityRule({ id });
      if (!r.ok) return void toast.error(r.error || "No se pudo quitar.");
      setRules(r.rules ?? []);
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div>
        <h3 className="font-semibold">Compatible con</h3>
        <p className="text-sm text-muted-foreground">
          Grupos de productos con los que este va: un rubro entero, o solo una marca o una línea dentro de él. Sirve para el portal y para los accesorios que exigen un producto principal.
        </p>
      </div>

      {rules.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {r.label} <span className="text-muted-foreground">· {r.count.toLocaleString("es-AR")} productos</span>
              </span>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => remove(r.id)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no tiene grupos compatibles.</p>
      )}

      {adding ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <Label>Rubro</Label>
            <CategoryTreePicker nodes={nodes} name="compat-category" defaultValue="" onChange={setCategoryId} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="compat-brand">Marca (opcional)</Label>
              <Select id="compat-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">Cualquier marca</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="compat-line">Línea (opcional)</Label>
              <Input id="compat-line" list="compat-lines" value={line} onChange={(e) => setLine(e.target.value)} placeholder="Ej: Sonamp" />
              <datalist id="compat-lines">
                {lines.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {empty
              ? "Elegí al menos un rubro, una marca o una línea."
              : preview
                ? `${preview.count.toLocaleString("es-AR")} productos entran${preview.examples.length ? `: ${preview.examples.join(", ")}${preview.count > preview.examples.length ? "…" : ""}` : ""}.`
                : "Contando…"}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending || empty} onClick={save}>Guardar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
          Agregar un grupo compatible
        </Button>
      )}
    </section>
  );
}
