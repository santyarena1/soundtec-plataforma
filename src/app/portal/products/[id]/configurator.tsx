"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { addToDraftRequest } from "@/server/actions/requests";
import { AccessoryWarningBlock } from "@/components/portal/accessory-warning";
import type { CompatiblePrimary } from "@/lib/accessory-context";

interface Option {
  id: string;
  name: string;
  type: string;
  values: unknown;
  priceDeltaUsd: number | null;
  isRequired: boolean;
}

interface Props {
  productId: string;
  basePrice: number;
  options: Option[];
  draftRequestId: string;
  accessoryContext?: {
    showWarning: boolean;
    warningMessage: string;
    compatiblePrimaries: CompatiblePrimary[];
  } | null;
}

function getValueList(opt: Option): string[] {
  if (Array.isArray(opt.values)) return (opt.values as unknown[]).map(String);
  if (typeof opt.values === "string") {
    try {
      const parsed = JSON.parse(opt.values);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return opt.values
        .split(/[\n,;]/)
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function ProductConfigurator({
  productId,
  basePrice,
  options,
  draftRequestId,
  accessoryContext = null,
}: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string | boolean | number>>({});
  const [quantity, setQuantity] = useState(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showAck, setShowAck] = useState(Boolean(accessoryContext?.showWarning));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const delta = useMemo(() => {
    let d = 0;
    for (const opt of options) {
      const v = selection[opt.id];
      if (v === undefined || v === "" || v === false) continue;
      if (opt.priceDeltaUsd != null) d += Number(opt.priceDeltaUsd);
    }
    return d;
  }, [options, selection]);

  function setOpt(id: string, value: string | boolean | number) {
    setSelection((s) => ({ ...s, [id]: value }));
  }

  function submit() {
    setError(null);
    setDone(false);
    for (const opt of options) {
      if (opt.isRequired) {
        const v = selection[opt.id];
        if (v === undefined || v === "" || v === false) {
          setError(`Falta seleccionar: ${opt.name}`);
          return;
        }
      }
    }
    if (showAck && accessoryContext && !acknowledged) {
      setError("Confirmá la advertencia del accesorio para continuar.");
      return;
    }

    const notes = JSON.stringify({
      configuration: Object.fromEntries(
        options
          .filter((o) => selection[o.id] !== undefined && selection[o.id] !== "")
          .map((o) => [o.name, selection[o.id]])
      ),
      configuredPriceUsd: basePrice + delta,
    });

    startTransition(async () => {
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("quantity", String(quantity));
      fd.set("userNotes", notes);
      if (acknowledged) fd.set("ackAccessoryWarning", "true");

      const r = await addToDraftRequest(fd);
      if (r.requiresAcknowledgement && r.warningMessage) {
        setShowAck(true);
        setAcknowledged(false);
        return;
      }
      if (!r?.ok) {
        setError(r?.error || "No se pudo agregar.");
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Configurar y agregar a tu solicitud</h3>
          <Badge tone="accent">{options.length} opcionales</Badge>
        </div>

        <div className="space-y-3">
          {options.map((opt) => {
            const values = getValueList(opt);
            const optDelta = opt.priceDeltaUsd != null ? Number(opt.priceDeltaUsd) : null;
            return (
              <div key={opt.id} className="space-y-1">
                <Label htmlFor={`opt-${opt.id}`}>
                  {opt.name}
                  {opt.isRequired ? <span className="text-destructive"> *</span> : null}
                  {optDelta && optDelta !== 0 ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({optDelta > 0 ? "+" : ""}
                      {formatUsd(optDelta)})
                    </span>
                  ) : null}
                </Label>
                {opt.type === "boolean" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      onChange={(e) => setOpt(opt.id, e.target.checked)}
                      checked={Boolean(selection[opt.id]) || false}
                    />
                    Incluir
                  </label>
                ) : values.length > 0 ? (
                  <select
                    id={`opt-${opt.id}`}
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                    onChange={(e) => setOpt(opt.id, e.target.value)}
                    value={(selection[opt.id] as string) ?? ""}
                  >
                    <option value="">{opt.isRequired ? "Seleccioná una opción" : "Sin seleccionar"}</option>
                    {values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`opt-${opt.id}`}
                    onChange={(e) => setOpt(opt.id, e.target.value)}
                    value={(selection[opt.id] as string) ?? ""}
                    placeholder="Detalle"
                  />
                )}
              </div>
            );
          })}
        </div>

        {showAck && accessoryContext ? (
          <AccessoryWarningBlock
            message={accessoryContext.warningMessage}
            compatiblePrimaries={accessoryContext.compatiblePrimaries}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
          />
        ) : null}

        <div>
          <Label htmlFor="qty">Cantidad</Label>
          <Input
            id="qty"
            type="number"
            min={1}
            className="max-w-[120px]"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio base</span>
            <span>{formatUsd(basePrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Opcionales</span>
            <span>
              {delta >= 0 ? "+" : ""}
              {formatUsd(delta)}
            </span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
            <span>Total estimado por unidad</span>
            <span>{formatUsd(basePrice + delta)}</span>
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {done ? (
          <p className="text-xs text-success">
            Configuración agregada.{" "}
            <Link href={`/portal/requests/${draftRequestId}`} className="underline">
              Ver mi solicitud
            </Link>
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={pending || Boolean(showAck && accessoryContext && !acknowledged)}
          >
            {pending ? "Agregando…" : "Agregar configuración a mi solicitud"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
