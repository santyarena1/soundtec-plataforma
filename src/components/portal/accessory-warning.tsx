"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompatiblePrimary } from "@/lib/accessory-context";

interface Props {
  message: string;
  compatiblePrimaries: CompatiblePrimary[];
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
  className?: string;
  compact?: boolean;
}

export function AccessoryWarningBlock({
  message,
  compatiblePrimaries,
  acknowledged,
  onAcknowledgedChange,
  className,
  compact,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-lg border border-warning/40 bg-warning/10 p-3",
        className
      )}
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 space-y-2">
          <p className={cn("text-foreground", compact ? "text-xs" : "text-sm")}>{message}</p>
          {compatiblePrimaries.length > 0 ? (
            <ul className={cn("space-y-0.5 text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
              {compatiblePrimaries.map((p) => (
                <li key={p.id}>
                  <Link href={`/portal/products/${p.id}`} className="font-medium text-accent hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => onAcknowledgedChange(e.target.checked)}
              className="mt-0.5"
            />
            <span className={cn("text-foreground", compact ? "text-[11px]" : "text-xs")}>
              Entiendo la recomendación y quiero continuar igual con este accesorio.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

export function AccessoryInfoBanner({
  message,
  compatiblePrimaries,
}: {
  message: string;
  compatiblePrimaries: CompatiblePrimary[];
}) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium">Accesorio de otro producto</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          {compatiblePrimaries.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Productos principales compatibles:{" "}
              {compatiblePrimaries.map((p, i) => (
                <span key={p.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/portal/products/${p.id}`} className="font-medium text-accent hover:underline">
                    {p.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Podés agregarlo a tu solicitud igualmente; te pediremos confirmar la advertencia.
          </p>
        </div>
      </div>
    </div>
  );
}
