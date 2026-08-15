"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function GenerateProposalButton({ quoteId, auto = false }: { quoteId: string; auto?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ran = useRef(false);

  function run() {
    setMsg(null);
    start(async () => {
      const res = await fetch(`/api/admin/quotes/${quoteId}/generate`, { method: "POST" });
      const r = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      setMsg(r.error || r.message || (res.ok ? "Listo" : "No se pudo generar"));
    });
  }

  useEffect(() => {
    if (!auto || ran.current) return;
    const key = `quote-autogen-${quoteId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    ran.current = true;
    if (typeof window !== "undefined") sessionStorage.setItem(key, "1");
    run();
  }, [auto, quoteId]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={pending} onClick={run}>
        {pending ? "Armando propuesta…" : "Generar propuesta con IA"}
      </Button>
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
