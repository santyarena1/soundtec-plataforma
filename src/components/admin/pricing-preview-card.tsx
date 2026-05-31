"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  baseCostUsd: number;
  tariffDutyPercent?: number | null;
  coefNac?: number | null;
  ivaPercent?: number | null;
  impIntPercent?: number | null;
  coefVtaFob?: number | null;
  tcVenta: number;
  globalCoefNac: number;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function PricingPreviewCard({
  baseCostUsd,
  tariffDutyPercent,
  coefNac,
  ivaPercent,
  impIntPercent,
  coefVtaFob,
  tcVenta,
  globalCoefNac,
}: Props) {
  const calc = useMemo(() => {
    const duty = tariffDutyPercent ?? 0;
    const costoConArancel = baseCostUsd * (1 + duty / 100);
    const tc = tcVenta;
    const coef = coefNac ?? globalCoefNac;
    const iva = ivaPercent ?? 21;
    const impInt = impIntPercent ?? 0;

    const precioNac = costoConArancel * tc * coef;
    const precioNacFinal = precioNac * (1 + iva / 100) * (1 + impInt / 100);
    const precioVtaFob = coefVtaFob ? baseCostUsd * coefVtaFob : null;

    return { costoConArancel, precioNac, precioNacFinal, precioVtaFob, tc, coef, iva, impInt, duty };
  }, [baseCostUsd, tariffDutyPercent, coefNac, ivaPercent, impIntPercent, coefVtaFob, tcVenta, globalCoefNac]);

  const row = (label: string, value: string, note?: string, highlight?: boolean) => (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 border-b border-border last:border-0 ${highlight ? "font-semibold" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-mono">{value}</span>
        {note && <span className="ml-2 text-[11px] text-muted-foreground">{note}</span>}
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Vista previa de precios (FOB → NAC)</h3>
        <div>
          {row("Costo base FOB", `USD ${fmt(baseCostUsd)}`)}
          {row(
            `+ Arancel (${fmt(calc.duty, 1)}%)`,
            `USD ${fmt(calc.costoConArancel)}`,
            `base × ${fmt(1 + calc.duty / 100, 4)}`
          )}
          {row(`TC venta`, `$${fmt(calc.tc, 2)} ARS/USD`, "configurado en Settings")}
          {row(
            `× Coef. NAC (${fmt(calc.coef, 4)})`,
            `ARS ${fmt(calc.precioNac)}`,
            coefNac == null ? "usando coef. global" : "coef. propio del producto"
          )}
          {row(
            `+ IVA ${fmt(calc.iva, 1)}% + Imp.Int ${fmt(calc.impInt, 1)}%`,
            `ARS ${fmt(calc.precioNacFinal)}`,
            undefined,
            true
          )}
          {calc.precioVtaFob != null
            ? row(`Precio venta FOB (×${fmt(coefVtaFob!, 4)})`, `USD ${fmt(calc.precioVtaFob)}`, undefined, true)
            : null}
        </div>
        {tcVenta === 0 && (
          <p className="mt-2 text-xs text-destructive">TC de venta no configurado — andá a Settings y cargá pricing.tc_venta.</p>
        )}
      </CardContent>
    </Card>
  );
}
