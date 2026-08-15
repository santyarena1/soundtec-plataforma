"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachQuotePlan, deleteQuoteAsset } from "@/server/actions/quote-images";

type Plan = { id: string; url: string; caption: string | null };

export function QuotePlanUpload({
  quoteId,
  plans,
  disabled,
}: {
  quoteId: string;
  plans: Plan[];
  disabled?: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(files: FileList | File[] | null) {
    if (!files || disabled) return;
    const list = Array.from(files);
    start(async () => {
      for (const file of list) {
        const fd = new FormData();
        fd.set("quoteId", quoteId);
        fd.set("file", file);
        fd.set("caption", file.name);
        const r = await attachQuotePlan(fd);
        if (r.error) {
          setMsg(r.error);
          return;
        }
      }
      setMsg(list.length > 1 ? `${list.length} archivos adjuntos.` : "Plano adjunto. La IA lo lee al generar.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Planos y fotos de obra</h3>
          <p className="text-xs text-muted-foreground">PDF o imagen. Varios. Quedan como contexto para la IA; no se fingen como foto de catálogo.</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{plans.length}</span>
      </div>

      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-8 text-center transition-colors hover:bg-secondary/60 disabled:opacity-50"
      >
        <span className="text-sm font-medium">{pending ? "Subiendo…" : "Soltá archivos acá o elegí"}</span>
        <span className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, DWG más adelante</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("quoteId", quoteId);
          start(async () => {
            const r = await attachQuotePlan(fd);
            setMsg(r.error || "URL adjunta.");
            e.currentTarget.reset();
          });
        }}
      >
        <Input name="url" placeholder="o pegá una URL pública del plano" disabled={disabled} />
        <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
          Adjuntar URL
        </Button>
      </form>

      {plans.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {plans.map((p) => {
            const isPdf = p.url.toLowerCase().includes(".pdf") || p.caption?.toLowerCase().endsWith(".pdf");
            return (
              <li key={p.id} className="overflow-hidden rounded-lg border border-border bg-card">
                {isPdf ? (
                  <div className="flex h-28 items-center justify-center bg-secondary text-xs font-medium">PDF</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.caption || "Plano"} className="h-28 w-full object-cover" />
                )}
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <span className="truncate text-[11px] text-muted-foreground">{p.caption || "Plano"}</span>
                  {!disabled ? (
                    <form action={deleteQuoteAsset}>
                      <input type="hidden" name="assetId" value={p.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Quitar
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay planos. Sin ellos la IA no puede leer la planta.</p>
      )}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
