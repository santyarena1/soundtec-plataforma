"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText, GitCompareArrows, ImageOff, Plus, X } from "lucide-react";
import type { CommercialTagView } from "@/lib/commercial-tags";
import { COMPARE_MAX, COMPARE_MIN, compareHref } from "@/lib/compare/selection";
import { onlyDifferences, type SpecGroup, type SpecTable } from "@/lib/compare/spec-table";
import { optimizedImage } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import { BackToCatalogLink, type CatalogMemoryKey } from "@/components/catalog/catalog-memory";
import { CommercialTagBadge, ProductLabelChips, type ProductLabelView } from "@/components/catalog/commercial-tag-badge";
import { ProductPrice } from "@/components/catalog/product-price";
import { compareStore, useCompareSelection } from "./compare-store";

/** Lo que necesita la tabla de cada producto (sin costos ni reglas: llega al navegador). */
export interface CompareColumnView {
  id: string;
  href: string;
  title: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  series: string | null;
  kind: "PRINCIPAL" | "ACCESORIO";
  image: string | null;
  tag: CommercialTagView | null;
  labels: ProductLabelView[];
  /** null = este usuario no ve precios (catálogo público). */
  price: { onRequest: boolean; finalUsd: number; regularUsd: number | null; discountPercent: number } | null;
  docs: Array<{ name: string; url: string; kind: string | null }>;
}

interface Props {
  columns: CompareColumnView[];
  specs: SpecTable;
  basePath: string;
  catalogHref: string;
  memoryKey: CatalogMemoryKey;
  /** Leyenda de impuestos bajo el precio (portal). */
  priceNote?: string;
  /** Sin precios: qué decir en la fila de precio (público). */
  noPriceNote?: React.ReactNode;
}

const DOCS_SHOWN = 4;

function same(values: Array<string | null>): boolean {
  const present = values.map((v) => (v ?? "").trim().toLowerCase());
  return present.every((v) => v === present[0]) && present[0] !== "";
}

export function CompareView({ columns, specs, basePath, catalogHref, memoryKey, priceNote, noPriceNote }: Props) {
  const router = useRouter();
  const selection = useCompareSelection();
  const [diffOnly, setDiffOnly] = useState(false);
  const n = columns.length;

  // La página fija la selección a lo que se compara (link compartido, ids que ya no se ven).
  const key = columns.map((c) => c.id).join(",");
  useEffect(() => {
    if (n === 0) return;
    compareStore.replace(columns.map((c) => ({ id: c.id, name: c.title, brand: c.brand, image: c.image })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Sin ids en la URL: se abre con lo elegido en el catálogo.
  useEffect(() => {
    if (n > 0) return;
    const stored = compareStore.get();
    if (stored.length > 0) router.replace(compareHref(basePath, stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  function removeColumn(id: string) {
    compareStore.remove(id);
    router.replace(compareHref(basePath, columns.filter((c) => c.id !== id)), { scroll: false });
  }

  const summary = useMemo(() => {
    const rows: Array<{ key: string; label: string; values: Array<string | null>; render?: (c: CompareColumnView) => React.ReactNode }> = [
      { key: "brand", label: "Marca", values: columns.map((c) => c.brand) },
      { key: "model", label: "Modelo", values: columns.map((c) => c.title) },
      { key: "category", label: "Rubro", values: columns.map((c) => c.category) },
      { key: "series", label: "Serie", values: columns.map((c) => c.series) },
      { key: "kind", label: "Tipo", values: columns.map((c) => (c.kind === "ACCESORIO" ? "Accesorio" : "Producto principal")) },
    ];
    return rows.filter((r) => r.values.some((v) => v)).map((r) => ({ ...r, differs: n > 1 && !same(r.values) }));
  }, [columns, n]);

  const groups: SpecGroup[] = diffOnly ? onlyDifferences(specs) : specs.groups;
  const summaryRows = diffOnly ? summary.filter((r) => r.differs) : summary;
  const diffTotal = specs.diffCount + summary.filter((r) => r.differs).length;

  if (n < COMPARE_MIN) {
    return <CompareEmpty n={n} selectionCount={selection.length} catalogHref={catalogHref} memoryKey={memoryKey} columns={columns} onRemove={removeColumn} />;
  }

  // Columna de rótulos fija; productos de ancho parejo, con scroll lateral en el celular.
  const gridMin = `calc(var(--label-col) + ${n} * var(--product-col))`;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <BackToCatalogLink memoryKey={memoryKey} fallbackHref={catalogHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver al catálogo
          </BackToCatalogLink>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold leading-tight sm:text-3xl">
            <GitCompareArrows className="h-6 w-6 text-primary" /> Comparar productos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {n} productos lado a lado · {diffTotal === 0 ? "no hay diferencias en los datos cargados" : `${diffTotal} ${diffTotal === 1 ? "dato cambia" : "datos cambian"} entre ellos`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium shadow-sm hover:border-primary/40">
            <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
              <input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} className="peer sr-only" />
              <span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
              <span className="absolute left-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform peer-checked:translate-x-4" />
            </span>
            Solo diferencias
          </label>
          {n < COMPARE_MAX ? (
            <BackToCatalogLink
              memoryKey={memoryKey}
              fallbackHref={catalogHref}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium shadow-sm hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-4 w-4" /> Sumar otro
            </BackToCatalogLink>
          ) : null}
          <button
            type="button"
            onClick={() => {
              compareStore.clear();
              router.push(catalogHref);
            }}
            className="inline-flex h-10 items-center rounded-full px-3 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Vaciar comparación
          </button>
        </div>
      </header>

      <div
        className="relative -mx-4 overflow-x-auto overscroll-x-contain border-y border-border bg-card [--label-col:7.25rem] [--product-col:11.5rem] sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm md:[--label-col:12rem] md:[--product-col:14rem] [scroll-snap-type:x_proximity] [scroll-padding-left:var(--label-col)]"
      >
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: gridMin }}>
          <colgroup>
            <col style={{ width: "var(--label-col)" }} />
            {columns.map((c) => (
              <col key={c.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 border-b border-r border-border bg-card p-3 text-left align-bottom md:p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {n} de {COMPARE_MAX}
                </span>
              </th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="border-b border-border p-3 text-left align-top font-normal [scroll-snap-align:start] md:p-4">
                  <ProductHead column={c} onRemove={() => removeColumn(c.id)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <RowLabel label="Precio" differs={false} />
              {columns.map((c) => (
                <td key={c.id} className="border-b border-border p-3 align-top md:p-4">
                  <PriceCell column={c} note={priceNote} noPriceNote={noPriceNote} />
                </td>
              ))}
            </tr>
            {summaryRows.map((row) => (
              <tr key={row.key}>
                <RowLabel label={row.label} differs={row.differs} />
                {row.values.map((v, i) => (
                  <ValueCell key={columns[i].id} value={v} differs={row.differs} strong={row.key === "model"} />
                ))}
              </tr>
            ))}
            {!diffOnly && columns.some((c) => c.labels.length > 0) ? (
              <tr>
                <RowLabel label="Etiquetas" differs={false} />
                {columns.map((c) => (
                  <td key={c.id} className="border-b border-border p-3 align-top md:p-4">
                    {c.labels.length ? <ProductLabelChips labels={c.labels} size="row" /> : <Missing />}
                  </td>
                ))}
              </tr>
            ) : null}

            {groups.map((group) => (
              <GroupRows key={group.name} group={group} n={n} columns={columns} />
            ))}

            {specs.rowCount === 0 ? (
              <tr>
                <td colSpan={n + 1} className="p-5 text-center text-sm text-muted-foreground">
                  Estas fichas todavía no tienen especificaciones técnicas cargadas para comparar.
                </td>
              </tr>
            ) : diffOnly && groups.length === 0 ? (
              <tr>
                <td colSpan={n + 1} className="p-5 text-center text-sm text-muted-foreground">
                  Las especificaciones cargadas son iguales en los {n} productos.
                </td>
              </tr>
            ) : null}

            {!diffOnly ? (
              <>
                <GroupHeader name="Documentos" n={n} />
                <tr>
                  <RowLabel label="Descargas" differs={false} />
                  {columns.map((c) => (
                    <td key={c.id} className="border-b border-border p-3 align-top md:p-4">
                      <DocsCell column={c} />
                    </td>
                  ))}
                </tr>
              </>
            ) : null}
            <tr>
              <td className="sticky left-0 z-10 border-r border-border bg-card p-3 md:p-4" />
              {columns.map((c) => (
                <td key={c.id} className="p-3 align-top md:p-4">
                  <Link
                    href={c.href}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-primary hover:bg-primary/10"
                  >
                    Ver ficha <ArrowRight className="h-4 w-4" />
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="mr-1 inline-block h-2 w-2 translate-y-[-1px] rounded-full bg-accent align-middle" /> Marca los datos que cambian entre productos. «—» indica que esa ficha no trae el dato.
      </p>
    </div>
  );
}

function ProductHead({ column: c, onRemove }: { column: CompareColumnView; onRemove: () => void }) {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="relative">
        <Link href={c.href} className="block aspect-[4/3] overflow-hidden rounded-xl border border-border bg-white p-3" aria-label={`Ver ficha de ${c.title}`}>
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImage(c.image, 384) ?? c.image} alt={c.title} className="h-full w-full object-contain" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <ImageOff className="h-6 w-6 opacity-40" /> Foto a confirmar
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${c.title} de la comparación`}
          title="Quitar de la comparación"
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm hover:border-destructive/50 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {c.tag ? <CommercialTagBadge tag={c.tag} size="card" className="absolute bottom-2 left-2" /> : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{c.brand || "Sin marca"}</p>
        <Link href={c.href} className="mt-0.5 block text-base font-semibold leading-snug text-foreground hover:text-primary md:text-lg">
          {c.title}
        </Link>
        {c.description ? <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{c.description}</p> : null}
      </div>
    </div>
  );
}

function PriceCell({ column: c, note, noPriceNote }: { column: CompareColumnView; note?: string; noPriceNote?: React.ReactNode }) {
  if (!c.price) return <div className="text-sm text-muted-foreground">{noPriceNote ?? "—"}</div>;
  if (c.price.onRequest) return <p className="text-lg font-semibold">Consultá precio</p>;
  return (
    <div>
      <ProductPrice finalUsd={c.price.finalUsd} regularUsd={c.price.regularUsd} discountPercent={c.price.discountPercent} size="card" />
      {note ? <p className="mt-1 text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function DocsCell({ column: c }: { column: CompareColumnView }) {
  if (c.docs.length === 0) return <Missing />;
  return (
    <ul className="space-y-1.5">
      {c.docs.slice(0, DOCS_SHOWN).map((d, i) => (
        <li key={`${d.url}-${i}`}>
          <a href={d.url} target="_blank" rel="noreferrer noopener" className="group/doc flex items-start gap-2 text-[13px] leading-snug text-foreground hover:text-primary">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="line-clamp-2 group-hover/doc:underline">{d.name}</span>
              {d.kind ? <span className="block text-[11px] text-muted-foreground">{d.kind}</span> : null}
            </span>
          </a>
        </li>
      ))}
      {c.docs.length > DOCS_SHOWN ? (
        <li>
          <Link href={c.href} className="text-xs font-medium text-primary hover:underline">
            +{c.docs.length - DOCS_SHOWN} en la ficha
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

function GroupRows({ group, n, columns }: { group: SpecGroup; n: number; columns: CompareColumnView[] }) {
  return (
    <>
      <GroupHeader name={group.name} n={n} />
      {group.rows.map((row) => (
        <tr key={row.key}>
          <RowLabel label={row.label} differs={row.differs} />
          {row.values.map((v, i) => (
            <ValueCell key={columns[i].id} value={v} differs={row.differs} />
          ))}
        </tr>
      ))}
    </>
  );
}

function GroupHeader({ name, n }: { name: string; n: number }) {
  return (
    <tr>
      <th scope="colgroup" className="sticky left-0 z-10 border-b border-border bg-secondary/80 px-3 pb-2 pt-5 text-left text-[11px] font-semibold uppercase tracking-wider text-primary backdrop-blur md:px-4">
        {name}
      </th>
      <td colSpan={n} className="border-b border-border bg-secondary/80 pt-5" />
    </tr>
  );
}

function RowLabel({ label, differs }: { label: string; differs: boolean }) {
  return (
    <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card p-3 text-left align-top text-[13px] font-medium leading-snug text-muted-foreground md:p-4">
      <span className="flex items-start gap-1.5">
        <span aria-hidden className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", differs ? "bg-accent" : "bg-transparent")} />
        <span className={cn("min-w-0 break-words", differs && "text-foreground")}>{label}</span>
      </span>
      {differs ? <span className="sr-only"> (cambia entre productos)</span> : null}
    </th>
  );
}

function ValueCell({ value, differs, strong }: { value: string | null; differs: boolean; strong?: boolean }) {
  return (
    <td className={cn("border-b border-border p-3 align-top leading-snug [overflow-wrap:anywhere] md:p-4", differs ? "text-foreground" : "text-muted-foreground", strong && "font-semibold text-foreground")}>
      {value ? value : <Missing />}
    </td>
  );
}

function Missing() {
  return (
    <span className="text-muted-foreground/60" aria-label="Sin dato">
      —
    </span>
  );
}

function CompareEmpty({
  n,
  selectionCount,
  catalogHref,
  memoryKey,
  columns,
  onRemove,
}: {
  n: number;
  selectionCount: number;
  catalogHref: string;
  memoryKey: CatalogMemoryKey;
  columns: CompareColumnView[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <GitCompareArrows className="mx-auto h-8 w-8 text-primary" />
      <h1 className="mt-3 text-xl font-semibold">Comparar productos</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {n === 1
          ? `Tenés ${columns[0].title} elegido. Sumá al menos uno más desde el catálogo con «Comparar».`
          : selectionCount > 0
            ? "Abriendo tu selección…"
            : "Tocá «Comparar» en 2 a 4 productos del catálogo (en la tarjeta, la lista o la ficha) y volvé acá."}
      </p>
      {n === 1 ? (
        <button type="button" onClick={() => onRemove(columns[0].id)} className="mt-2 text-xs text-muted-foreground underline hover:text-foreground">
          Quitar {columns[0].title}
        </button>
      ) : null}
      <div className="mt-5">
        <BackToCatalogLink
          memoryKey={memoryKey}
          fallbackHref={catalogHref}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" /> Ir al catálogo
        </BackToCatalogLink>
      </div>
    </div>
  );
}
