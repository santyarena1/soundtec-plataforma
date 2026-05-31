"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

interface DolarData {
  oficial: number;
  blue: number;
  mep: number;
  updatedAt: string;
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function fetchDolar(): Promise<DolarData | null> {
  try {
    const res = await fetch("https://api.bluelytics.com.ar/v2/latest", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      oficial: data.oficial?.value_sell ?? 0,
      blue: data.blue?.value_sell ?? 0,
      mep: data.mep?.value_sell ?? 0,
      updatedAt: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return null;
  }
}

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function DolarTicker({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<DolarData | null>(null);
  const [error, setError] = useState(false);
  const [isPending, start] = useTransition();

  function load() {
    start(async () => {
      const result = await fetchDolar();
      if (result) {
        setData(result);
        setError(false);
      } else {
        setError(true);
      }
    });
  }

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (compact) {
    // Inline version for mobile header
    if (error || !data) return null;
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>💵</span>
        <span>Ofic. <strong className="text-foreground">${fmt(data.oficial)}</strong></span>
        <span>Blue <strong className="text-blue-600">${fmt(data.blue)}</strong></span>
      </div>
    );
  }

  // Full version for sidebar
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dólar</span>
        <button
          type="button"
          onClick={load}
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground"
          title="Actualizar"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <p className="text-[11px] text-muted-foreground">Sin conexión</p>
      ) : !data ? (
        <p className="text-[11px] text-muted-foreground animate-pulse">Cargando...</p>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Oficial</span>
              <span className="text-xs font-semibold tabular-nums">${fmt(data.oficial)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Blue</span>
              <span className="text-xs font-semibold tabular-nums text-blue-600">${fmt(data.blue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">MEP</span>
              <span className="text-xs font-semibold tabular-nums text-green-600">${fmt(data.mep)}</span>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/60">Actualizado {data.updatedAt} · cada 5 min</p>
        </>
      )}
    </div>
  );
}
