"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GenerateProposalButton({ quoteId, auto = false }: { quoteId: string; auto?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ran = useRef(false);

  function run() {
    setMsg(null);
    start(async () => {
      const res = await fetch(`/api/admin/quotes/${quoteId}/generate`, { method: "POST" });
      const r = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (r.ok) {
        setMsg(r.message || "Propuesta generada. Revisá las sugerencias en Productos y el texto de «Nuestra propuesta».");
        router.refresh();
      } else {
        setMsg(r.error || r.message || "No se pudo generar la propuesta.");
      }
    });
  }

  useEffect(() => {
    if (!auto || ran.current) return;
    const key = `quote-autogen-${quoteId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    ran.current = true;
    if (typeof window !== "undefined") sessionStorage.setItem(key, "1");
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, quoteId]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={run}>
          {pending ? "Armando propuesta…" : "Generar propuesta con IA"}
        </Button>
        {pending ? (
          <p className="text-sm text-muted-foreground">
            Esto puede tardar un minuto: lee el brief, deja equipos como sugerencias y redacta «Nuestra propuesta».
          </p>
        ) : null}
      </div>
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      {!pending && !msg ? (
        <p className="text-xs text-muted-foreground">
          Redacta «Nuestra propuesta» y deja equipos como sugerencias en Productos para que los apruebes o los elijas
          a mano. No los vuelca a la planilla. Los módulos fijos no se reescriben.
        </p>
      ) : null}
    </div>
  );
}
