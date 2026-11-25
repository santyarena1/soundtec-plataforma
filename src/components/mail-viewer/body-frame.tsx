"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff, Mail, MailOpen } from "lucide-react";
import { setMessageSeenAction } from "@/server/actions/mail-viewer";

/**
 * Cuerpo del mail en un iframe aislado: sandbox sin scripts, sin formularios y
 * con origen opaco (no ve cookies ni el portal). Imágenes remotas bloqueadas
 * hasta tocar «Mostrar imágenes». Pestaña «Texto» con la versión sin formato.
 */
export function BodyFrame({ htmlSrc, htmlWithImagesSrc, hasHtml, text, blockedImages }: { htmlSrc: string; htmlWithImagesSrc: string; hasHtml: boolean; text: string; blockedImages: number }) {
  const [mode, setMode] = useState<"html" | "text">(hasHtml ? "html" : "text");
  const [images, setImages] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        {hasHtml ? (
          <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Formato">
            {(["html", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded px-2 py-0.5 font-medium ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "html" ? "Con formato" : "Texto"}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">Mensaje sin formato</span>
        )}
        {mode === "html" && blockedImages > 0 && !images ? (
          <span className="ml-auto flex items-center gap-2 text-muted-foreground">
            <ImageOff className="h-3.5 w-3.5" />
            {blockedImages === 1 ? "Se bloqueó 1 imagen remota" : `Se bloquearon ${blockedImages} imágenes remotas`} (pueden avisar al remitente que se abrió).
            <button type="button" onClick={() => setImages(true)} className="rounded border border-border px-2 py-0.5 font-medium text-foreground hover:bg-secondary">
              Mostrar imágenes
            </button>
          </span>
        ) : null}
      </div>
      {mode === "html" && hasHtml ? (
        <iframe
          key={images ? "img" : "noimg"}
          title="Contenido del mensaje"
          src={images ? htmlWithImagesSrc : htmlSrc}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="block h-[65vh] min-h-[360px] w-full bg-white"
        />
      ) : (
        <pre className="max-h-[65vh] min-h-[200px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed">{text || "(Sin texto)"}</pre>
      )}
    </div>
  );
}

export function SeenToggle({ folder, uid, seen, disabled }: { folder: string; uid: number; seen: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || disabled}
      title={disabled ? "En «Ver como» la casilla es solo lectura." : undefined}
      onClick={() =>
        start(async () => {
          const result = await setMessageSeenAction({ folder, uid, seen: !seen });
          if (!result.ok) return void toast.error(result.error);
          toast.success(seen ? "Marcado como no leído." : "Marcado como leído.");
          router.refresh();
        })
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50"
    >
      {seen ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
      {pending ? "Guardando…" : seen ? "Marcar como no leído" : "Marcar como leído"}
    </button>
  );
}
