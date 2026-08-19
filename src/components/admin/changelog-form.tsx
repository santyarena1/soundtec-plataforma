"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { upsertChangelog } from "@/server/actions/changelog";
import { CHANGELOG_KINDS, type ChangelogEntryView, type ChangelogItem, type ChangelogKind } from "@/lib/changelog";

function emptyItem(): ChangelogItem {
  return { kind: "NUEVO", text: "" };
}

function dateInputValue(iso?: string) {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

export function ChangelogForm({
  initial,
  onCancel,
}: {
  initial?: ChangelogEntryView | null;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [version, setVersion] = useState(initial?.version || "");
  const [releasedAt, setReleasedAt] = useState(dateInputValue(initial?.releasedAt));
  const [summary, setSummary] = useState(initial?.summary || "");
  const [published, setPublished] = useState(initial?.isPublished ?? true);
  const [items, setItems] = useState<ChangelogItem[]>(initial?.items.length ? initial.items : [emptyItem()]);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<ChangelogItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    if (initial?.id) fd.set("id", initial.id);
    fd.set("version", version);
    fd.set("releasedAt", releasedAt);
    fd.set("summary", summary);
    if (published) fd.set("isPublished", "on");
    for (const item of items) {
      fd.append("itemKind", item.kind);
      fd.append("itemText", item.text);
    }
    start(async () => {
      const result = await upsertChangelog(fd);
      if (!result.ok) {
        setError(result.error || "No se pudo guardar.");
        return;
      }
      toast.success(initial ? "Novedad actualizada." : "Novedad publicada. El resto del equipo la va a ver al entrar.");
      onCancel?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="changelog-version" required>
            Versión
          </Label>
          <Input
            id="changelog-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0"
            required
          />
        </div>
        <div>
          <Label htmlFor="changelog-date" required>
            Fecha
          </Label>
          <Input
            id="changelog-date"
            type="date"
            value={releasedAt}
            onChange={(e) => setReleasedAt(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="changelog-summary" required>
            En pocas palabras
          </Label>
          <Textarea
            id="changelog-summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Resumen corto para el popup y la tarjeta."
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label required>Cambios</Label>
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <Select
              value={item.kind}
              onChange={(e) => updateItem(index, { kind: e.target.value as ChangelogKind })}
              className="w-28 shrink-0"
            >
              {CHANGELOG_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </Select>
            <Input
              value={item.text}
              onChange={(e) => updateItem(index, { text: e.target.value })}
              placeholder={
                item.kind === "NUEVO"
                  ? "Qué se agregó…"
                  : item.kind === "FIX"
                    ? "Qué se corrigió…"
                    : "Qué se mejoró…"
              }
              required
            />
            {items.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 text-muted-foreground"
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                aria-label="Quitar cambio"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
          <Plus className="h-4 w-4" />
          Agregar cambio
        </Button>
      </div>

      <label className="flex h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Publicar ahora (si está tildado, aparece el popup a quien todavía no lo vio)
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {initial && onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {initial ? "Guardar cambios" : "Publicar novedad"}
        </Button>
      </div>
    </form>
  );
}
