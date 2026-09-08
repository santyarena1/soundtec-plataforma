"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui/table";
import { describeRuleAppliesTo, formatMarginPercent, formatMarkup } from "@/lib/pricing-scope";
import type { ProductCoverageRow } from "@/server/actions/pricing-coverage";

function RuleCell({ kind, row }: { kind: "margin" | "discount"; row: ProductCoverageRow }) {
  if (row.appliedRuleRow)
    return (
      <div className="space-y-1">
        <Badge tone="success">{row.appliedRuleRow.name}</Badge>
        <p className="text-xs text-muted-foreground">
          {describeRuleAppliesTo(row.appliedRuleRow)} ·{" "}
          {kind === "margin"
            ? row.appliedRuleRow.markupMultiplier
              ? formatMarkup(row.appliedRuleRow.markupMultiplier)
              : `Margen ${formatMarginPercent(row.appliedRuleRow.percent)}`
            : `-${formatMarginPercent(row.appliedRuleRow.percent)}`}
        </p>
      </div>
    );
  if (kind === "discount" && row.source === "PRODUCT_FIELD")
    return (
      <div>
        <Badge tone="success">Descuento del producto</Badge>
        <p className="text-xs text-muted-foreground">-{formatMarginPercent(row.discountPercent)}</p>
      </div>
    );
  return (
    <div>
      <Badge tone="warning">{kind === "discount" ? "Sin descuento" : "Sin regla"}</Badge>
      {kind === "margin" ? (
        <p className="text-xs text-muted-foreground">
          {row.source === "COEF_VTA"
            ? `Usa coef. venta del producto ${formatMarkup(row.markupMultiplier)}`
            : `Usa markup por defecto ${formatMarkup(row.markupMultiplier)}`}
        </p>
      ) : null}
    </div>
  );
}

export function CoverageTable({
  kind,
  rows,
  selected,
  onSelected,
  onOpen,
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  onApply,
}: {
  kind: "margin" | "discount";
  rows: ProductCoverageRow[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  onOpen: (row: ProductCoverageRow) => void;
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onApply: () => void;
}) {
  const all = rows.length > 0 && rows.every((x) => selected.includes(x.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const toggle = (id: string) =>
    onSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="space-y-3">
      {selected.length ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <span>
            {selected.length} producto{selected.length === 1 ? "" : "s"} seleccionado
            {selected.length === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={onApply}>
            Aplicar regla a los {selected.length} seleccionados
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <TableEmpty message="No hay productos para estos filtros." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>
                <input
                  aria-label="Seleccionar esta página"
                  type="checkbox"
                  checked={all}
                  onChange={() =>
                    onSelected(
                      all
                        ? selected.filter((id) => !rows.some((r) => r.id === id))
                        : [...new Set([...selected, ...rows.map((r) => r.id)])],
                    )
                  }
                />
              </TH>
              <TH>Producto</TH>
              <TH>Marca</TH>
              <TH>Categoría / familia</TH>
              <TH>Costo</TH>
              <TH>Regla aplicada</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR
                key={row.id}
                className="cursor-pointer hover:bg-secondary/40"
                onClick={() => onOpen(row)}
              >
                <TD onClick={(e) => e.stopPropagation()}>
                  <input
                    aria-label={`Seleccionar ${row.name}`}
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                </TD>
                <TD>
                  <div className="flex items-center gap-3">
                    {row.imageUrl ? (
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="h-11 w-11 rounded border object-contain"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded bg-secondary" />
                    )}
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.sku || "Sin SKU"}</p>
                    </div>
                  </div>
                </TD>
                <TD>{row.brandName || "—"}</TD>
                <TD>
                  <p>{row.categoryName || "—"}</p>
                  <p className="text-xs text-muted-foreground">{row.familyName || "Sin familia"}</p>
                </TD>
                <TD className="tabular-nums">
                  USD {row.baseCostUsd.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                </TD>
                <TD>
                  <RuleCell kind={kind} row={row} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          Página {page} de {pages} · {total.toLocaleString("es-AR")} productos
        </span>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Productos por página"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} por página
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
