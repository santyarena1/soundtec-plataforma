"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { archiveDocumentType, createDocumentType, updateDocumentType } from "@/server/actions/quote-document-types";

type DocType = { key: string; name: string; baseKey: "resumido" | "tecnico" | "premium"; audience: string | null; sectionKeys: string[]; isCustom: boolean; description: string | null };
type Module = { key: string; title: string; kind: string; defaultOn: string[] };
type Option = { key: string; label: string };

const BASES: Option[] = [
  { key: "resumido", label: "Corto" },
  { key: "tecnico", label: "Estándar" },
  { key: "premium", label: "Completo" },
];

type Draft = { name: string; baseKey: DocType["baseKey"]; audience: string; sectionKeys: string[]; description: string };

/**
 * Tipos de documento propios («Compacto escolar», «Completo hotelería»): parten
 * de Corto, Estándar o Completo, eligen qué secciones van y, si apuntan a un
 * rubro, los textos salen en la versión de ese rubro. Se eligen al crear una
 * cotización (también en la rápida).
 */
export function DocumentTypesManager({ types, modules, audiences }: { types: DocType[]; modules: Module[]; audiences: Option[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // key o "nuevo"
  const baseSections = (baseKey: string) => modules.filter((m) => m.defaultOn.includes(baseKey)).map((m) => m.key);
  const [draft, setDraft] = useState<Draft>({ name: "", baseKey: "resumido", audience: "", sectionKeys: baseSections("resumido"), description: "" });
  const audienceLabel = (k: string | null) => audiences.find((a) => a.key === k)?.label ?? null;
  const baseLabel = (k: string) => BASES.find((b) => b.key === k)?.label ?? k;

  function open(type?: DocType) {
    setEditing(type?.key ?? "nuevo");
    setDraft(
      type
        ? { name: type.name, baseKey: type.baseKey, audience: type.audience ?? "", sectionKeys: type.sectionKeys, description: type.description ?? "" }
        : { name: "", baseKey: "resumido", audience: "", sectionKeys: baseSections("resumido"), description: "" },
    );
  }

  function save() {
    start(async () => {
      const input = { ...draft, audience: draft.audience || null, description: draft.description || null };
      const r = editing === "nuevo" ? await createDocumentType(input) : await updateDocumentType(editing!, input);
      if (!r.ok) return void toast.error(r.error);
      toast.success(editing === "nuevo" ? "Tipo creado: ya se puede elegir al crear una cotización." : "Guardado.");
      setEditing(null);
      router.refresh();
    });
  }

  async function remove(type: DocType) {
    if (!(await confirmDialog({ title: "Quitar tipo de documento", message: `¿Quitar «${type.name}»? Las cotizaciones que ya lo usan no cambian.`, confirmLabel: "Quitar", tone: "danger" }))) return;
    start(async () => {
      const r = await archiveDocumentType(type.key);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Quitado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {types.map((t) => (
          <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">
                {t.isCustom ? `Basado en ${baseLabel(t.baseKey)} · ` : "Tipo base · "}
                {t.sectionKeys.length} secciones{t.audience ? ` · textos para ${audienceLabel(t.audience)}` : ""}
              </p>
            </div>
            {t.isCustom ? (
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => open(t)} disabled={pending}>
                  Editar
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(t)} disabled={pending}>
                  Quitar
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="font-medium">{editing === "nuevo" ? "Nuevo tipo de documento" : `Editar «${draft.name}»`}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="dt-name">Nombre</Label>
              <Input id="dt-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. Compacto escolar" />
            </div>
            <div>
              <Label htmlFor="dt-base">Basado en</Label>
              <Select
                id="dt-base"
                value={draft.baseKey}
                onChange={(e) => {
                  const baseKey = e.target.value as DocType["baseKey"];
                  setDraft({ ...draft, baseKey, sectionKeys: baseSections(baseKey) });
                }}
              >
                {BASES.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="dt-aud">Textos para (opcional)</Label>
              <Select id="dt-aud" value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })}>
                <option value="">Cualquier rubro (textos generales)</option>
                {audiences.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Qué secciones lleva el PDF</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.sectionKeys.includes(m.key)}
                    onChange={(e) =>
                      setDraft({ ...draft, sectionKeys: e.target.checked ? [...draft.sectionKeys, m.key] : draft.sectionKeys.filter((k) => k !== m.key) })
                    }
                  />
                  {m.title}
                  {m.kind === "ai" ? <span className="text-xs text-muted-foreground">(lo escribe la IA)</span> : null}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing === "nuevo" ? "Crear tipo" : "Guardar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Las versiones de cada texto para un rubro se escriben en «Textos del PDF». Un tipo con rubro elige esas versiones solo.
          </p>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => open()}>
          <Plus className="h-4 w-4" /> Nuevo tipo de documento
        </Button>
      )}
    </div>
  );
}
