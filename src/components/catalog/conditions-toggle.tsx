"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Loader2 } from "lucide-react";
import { setConditionsPrices } from "@/server/actions/client-conditions";
import { cn } from "@/lib/utils";

/**
 * «Activá tus descuentos»: solo para clientes con condiciones comerciales
 * propias. Apagado = precios de lista; prendido = con las condiciones de su empresa.
 */
export function ConditionsToggle({ on, className }: { on: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimisticOn, setOptimisticOn] = useState(on);
  useEffect(() => setOptimisticOn(on), [on]);

  function toggle() {
    const next = !optimisticOn;
    setOptimisticOn(next);
    start(async () => {
      await setConditionsPrices(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimisticOn}
      onClick={toggle}
      disabled={pending}
      data-tour="conditions-toggle"
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-80",
        optimisticOn ? "border-success/40 bg-success/10" : "border-primary/25 bg-primary/5 hover:border-primary/50",
        className
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", optimisticOn ? "bg-success text-white" : "bg-primary text-primary-foreground")}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgePercent className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight text-foreground">{optimisticOn ? "Descuentos activados" : "Activá tus descuentos"}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {optimisticOn ? "Ves los precios con las condiciones de tu empresa." : "Ver los precios con las condiciones de tu empresa."}
        </span>
      </span>
      <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", optimisticOn ? "bg-success" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", optimisticOn ? "translate-x-[1.125rem]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}
