"use client";

import { useMemo } from "react";

interface Props {
  baseCostUsd: number;
  coefNac?: number | null;
  coefVta?: number | null;
  discountPercent?: number | null;
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
  coefNac,
  coefVta,
  discountPercent,
  ivaPercent,
  impIntPercent,
  coefVtaFob,
  tcVenta,
  globalCoefNac,
}: Props) {
  const calc = useMemo(() => {
    const cn = coefNac ?? globalCoefNac;
    const cv = coefVta ?? 1;
    const discount = discountPercent ?? 0;
    const iva = ivaPercent ?? 21;
    const impInt = impIntPercent ?? 0;

    const costoNacUsd = baseCostUsd * cn;
    const descuentoCoef = 1 - discount / 100;
    const precioNac = costoNacUsd * cv * descuentoCoef;
    const precioNacFinal = precioNac * (1 + iva / 100) * (1 + impInt / 100);
    const precioVtaFob = coefVtaFob ? baseCostUsd * coefVtaFob : null;

    return { costoNacUsd, precioNac, precioNacFinal, precioVtaFob, cn, cv, discount, iva, impInt };
  }, [baseCostUsd, coefNac, coefVta, discountPercent, ivaPercent, impIntPercent, coefVtaFob, globalCoefNac]);

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
    <div>
      <h3 className="mb-3 text-sm font-semibold text-blue-900 dark:text-blue-200">Vista previa de precios (FOB → NAC)</h3>
      <div>
        {row("Costo base FOB", `USD ${fmt(baseCostUsd)}`)}
        {row(
          `× COEF NAC (${fmt(calc.cn, 4)})`,
          `USD ${fmt(calc.costoNacUsd)}`,
          coefNac == null ? "usando coef. global" : "coef. propio"
        )}
        {row(
          `× COEF VTA (${fmt(calc.cv, 4)}) × Dto (${fmt(100 - calc.discount, 1)}%)`,
          `USD ${fmt(calc.precioNac)}`
        )}
        {row(
          `+ IVA ${fmt(calc.iva, 1)}% + Imp.Int ${fmt(calc.impInt, 1)}%`,
          `USD ${fmt(calc.precioNacFinal)}`,
          undefined,
          true
        )}
        {calc.precioVtaFob != null
          ? row(`Precio FOB (×${fmt(coefVtaFob!, 4)})`, `USD ${fmt(calc.precioVtaFob)}`, undefined, true)
          : null}
      </div>
      {tcVenta > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">TC venta configurado: ${fmt(tcVenta)} ARS/USD</p>
      )}
      {tcVenta === 0 && (
        <p className="mt-2 text-xs text-destructive">TC de venta no configurado — andá a Settings y cargá pricing.tc_venta.</p>
      )}
    </div>
  );
}
