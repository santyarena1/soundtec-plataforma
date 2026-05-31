"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Database, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedCrestronDevices, matchCrestronProducts } from "@/server/actions/crestron-home";

export function CrestronActionsBar() {
  const router = useRouter();
  const [seedPending, startSeed] = useTransition();
  const [matchPending, startMatch] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleSeed() {
    setMsg(null);
    startSeed(async () => {
      const r = await seedCrestronDevices();
      setMsg(r.ok ? `Seed completado: ${r.created} dispositivos nuevos cargados.` : "Error en seed.");
      router.refresh();
    });
  }

  function handleMatch() {
    setMsg(null);
    startMatch(async () => {
      const r = await matchCrestronProducts();
      setMsg(
        r.ok
          ? `Matching completado: ${r.matched} productos marcados como compatibles (de ${r.total} modelos en la lista).`
          : "Error en matching."
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSeed}
        disabled={seedPending || matchPending}
      >
        {seedPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        Cargar modelos Crestron
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={handleMatch}
        disabled={seedPending || matchPending}
      >
        {matchPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        Marcar productos compatibles
      </Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
