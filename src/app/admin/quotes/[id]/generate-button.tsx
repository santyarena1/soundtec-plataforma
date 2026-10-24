"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Un poco menos que el maxDuration de la ruta (300 s). */
const GENERATE_TIMEOUT_MS = 290_000;

type GenerateResponse = { ok?: boolean; error?: string; message?: string };

async function postGenerate(quoteId: string, brief: string | undefined): Promise<GenerateResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/admin/quotes/${quoteId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief === undefined ? {} : { brief }),
      signal: controller.signal,
    });
    const type = res.headers.get("content-type") || "";
    if (!type.includes("application/json")) {
      // Vercel devuelve HTML cuando la función se corta o se cae.
      return {
        ok: false,
        error:
          res.status === 504 || res.status === 408
            ? "La generación tardó demasiado y el servidor la cortó. Probá de nuevo; si se repite, acortá el brief."
            : `El servidor respondió con un error (${res.status}). Probá de nuevo en un rato.`,
      };
    }
    return (await res.json()) as GenerateResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "La generación tardó más de 5 minutos. Probá de nuevo en un rato." };
    }
    return { ok: false, error: "No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo." };
  } finally {
    clearTimeout(timer);
  }
}

export function GenerateProposalButton({
  quoteId,
  auto = false,
  briefFieldId,
}: {
  quoteId: string;
  auto?: boolean;
  /** id del textarea del brief: si está en pantalla, se manda (y se guarda) lo escrito. */
  briefFieldId?: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  const ran = useRef(false);

  function currentBrief(): string | undefined {
    if (!briefFieldId || typeof document === "undefined") return undefined;
    const field = document.getElementById(briefFieldId);
    return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement ? field.value : undefined;
  }

  function run() {
    setMsg(null);
    start(async () => {
      const r = await postGenerate(quoteId, currentBrief());
      if (r.ok) {
        const text = r.message || "Propuesta generada.";
        setMsg({ text, error: false });
        toast.success("Propuesta generada", { description: text });
        router.refresh();
      } else {
        const text = r.error || r.message || "No se pudo generar la propuesta.";
        setMsg({ text, error: true });
        toast.error("No se generó la propuesta", { description: text });
        router.refresh();
      }
    });
  }

  useEffect(() => {
    if (!auto || ran.current) return;
    const key = `quote-autogen-${quoteId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* sin sessionStorage: igual corre una sola vez por montaje */
    }
    ran.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, quoteId]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={run}>
          {pending ? "Armando propuesta…" : "Generar propuesta y sugerir equipos"}
        </Button>
        {pending ? (
          <p className="text-sm text-muted-foreground">
            Esto puede tardar un minuto: lee el brief, deja equipos como sugerencias y redacta los módulos de proyecto.
          </p>
        ) : null}
      </div>
      {msg ? (
        <p className={msg.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={msg.error ? "alert" : "status"}>
          {msg.text}
        </p>
      ) : null}
      {!pending && !msg ? (
        <p className="text-xs text-muted-foreground">
          Redacta los módulos de proyecto con los equipos ya cargados y deja equipos nuevos como sugerencias en
          Productos para que los apruebes. No toca módulos fijos ni los que editaste a mano.
        </p>
      ) : null}
    </div>
  );
}
