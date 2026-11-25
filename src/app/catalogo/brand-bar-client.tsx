"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo, BrandName, SoonTag, useBrokenLogos, type BrandUiCell, type BrandUiItem } from "./brand-ui";
import styles from "./brand-bar.module.css";

export type BrandBarEntry =
  | { type: "brand"; brand: BrandUiItem }
  | { type: "soon"; name: string }
  | { type: "family"; lead: BrandUiItem; members: BrandUiCell[]; memberIds: string[]; allHref: string };

type LogoProps = { broken: ReadonlySet<string>; onBroken: (id: string) => void };

const TILE =
  "flex h-12 min-w-0 flex-none items-center justify-center gap-2 rounded-lg border bg-card px-3 outline-none transition-[background-color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:flex-auto 2xl:h-14";
const ACTIVE = "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]";
const IDLE = "border-border hover:border-foreground/20 hover:bg-muted/30";

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Barra de marcas arriba de los resultados. Solo la marca principal de cada
 * grupo: al tocarla se despliegan debajo sus hermanas y «Ver todas» (filtra el
 * grupo entero). Crestron y Crestron Home van siempre separadas y rotuladas.
 * La marca elegida lleva un recuadro con un trazo de luz que recorre el borde.
 */
export function BrandBarClient({ entries, activeIds, basePath }: { entries: BrandBarEntry[]; activeIds: string[]; basePath: string }) {
  const root = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { broken, markBroken } = useBrokenLogos(root, [entries]);
  const logoProps = { broken, onBroken: markBroken };

  const activeFamily = entries.find((e) => e.type === "family" && e.memberIds.some((id) => activeIds.includes(id)));
  const [openId, setOpenId] = useState<string | null>(activeFamily?.type === "family" ? activeFamily.lead.id : null);
  useEffect(() => {
    setOpenId(activeFamily?.type === "family" ? activeFamily.lead.id : null);
  }, [activeFamily]);
  const open = entries.find((e) => e.type === "family" && e.lead.id === openId);

  // En el celular, la marca elegida queda a la vista dentro de la tira (sin mover la página).
  useEffect(() => {
    const el = strip.current;
    const active = el?.querySelector<HTMLElement>("[data-active='true']");
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, active.offsetLeft - el.offsetLeft - 16);
  }, [activeIds]);

  const allActive = activeIds.length === 0;
  const isActive = (id: string) => activeIds.length === 1 && activeIds[0] === id;

  return (
    <nav ref={root} aria-label="Marcas">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Marcas</h2>
        <Link
          href={`${basePath}?all=1`}
          data-active={allActive}
          aria-current={allActive ? "page" : undefined}
          className={cn(
            styles.cell,
            "inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            allActive ? "border-primary text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary))]" : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          Todas
        </Link>
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>

      <div ref={strip} className={cn(styles.strip, "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0")}>
        {entries.map((entry) => {
          if (entry.type === "soon") return <SoonTile key={`soon-${entry.name}`} name={entry.name} />;
          if (entry.type === "brand") return <BrandTile key={entry.brand.id} brand={entry.brand} active={isActive(entry.brand.id)} {...logoProps} />;
          const familyActive = entry.memberIds.some((id) => activeIds.includes(id));
          const expanded = openId === entry.lead.id;
          return (
            <button
              key={entry.lead.id}
              type="button"
              data-active={familyActive}
              aria-expanded={expanded}
              aria-controls={panelId}
              title={`${entry.lead.name} y sus marcas`}
              onClick={() => setOpenId(expanded ? null : entry.lead.id)}
              className={cn(styles.cell, TILE, "min-w-[8.5rem] pl-4 pr-2.5", familyActive ? ACTIVE : expanded ? "border-foreground/25 bg-muted/40" : IDLE)}
            >
              <BrandLogo brand={entry.lead} heightClass="h-7 2xl:h-8" compactClass="h-9 w-[4.5rem]" nameClass="text-[11px] tracking-[0.12em]" {...logoProps} />
              <span className="flex flex-none items-center gap-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                +{entry.members.length - 1}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
              </span>
            </button>
          );
        })}
        {/* Se come el espacio que sobra en el último renglón: así esas cajas no se estiran de más. */}
        <span aria-hidden className="hidden md:block md:flex-[999_1_0%]" />
      </div>

      {open?.type === "family" ? (
        <div id={panelId} className={cn(styles.panel, "mt-2 rounded-xl border border-border bg-muted/25 p-2")}>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{open.lead.name} y sus marcas</p>
            <Link
              href={open.allHref}
              data-active={sameSet(activeIds, open.memberIds)}
              className={cn(
                styles.cell,
                "inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                sameSet(activeIds, open.memberIds) ? "border-primary bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary))]" : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              Ver todas ({open.memberIds.length})
            </Link>
          </div>
          <div className={cn(styles.strip, "-mx-2 flex gap-1.5 overflow-x-auto px-2 md:mx-0 md:flex-wrap md:overflow-visible md:px-0")}>
            {open.members.map((cell) =>
              cell.type === "soon" ? (
                <SoonTile key={`soon-${cell.name}`} name={cell.name} />
              ) : (
                <BrandTile key={cell.brand.id} brand={cell.brand} active={isActive(cell.brand.id)} small {...logoProps} />
              )
            )}
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function BrandTile({ brand, active, small = false, broken, onBroken }: { brand: BrandUiItem; active: boolean; small?: boolean } & LogoProps) {
  return (
    <Link
      href={brand.href}
      data-active={active}
      aria-current={active ? "page" : undefined}
      title={brand.comingSoon ? `${brand.name} · Próximamente` : brand.name}
      className={cn(styles.cell, TILE, small ? "h-11 min-w-[7.5rem] 2xl:h-12" : "min-w-[7.5rem]", "flex-col gap-0.5", brand.caption !== undefined && "flex-row gap-2 pl-2", active ? ACTIVE : IDLE)}
    >
      <BrandLogo
        brand={brand}
        heightClass={small ? "h-6 2xl:h-7" : "h-7 2xl:h-8"}
        compactClass={small ? "h-8 w-[4rem]" : "h-9 w-[4.5rem]"}
        nameClass="text-[11px] tracking-[0.12em]"
        broken={broken}
        onBroken={onBroken}
      />
      {brand.caption !== undefined ? (
        <span className="flex flex-col items-start leading-tight">
          <span className="whitespace-nowrap text-xs font-semibold text-foreground">{brand.name}</span>
          {brand.caption ? (
            <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.1em] text-accent">{brand.caption}</span>
          ) : null}
        </span>
      ) : null}
      {brand.comingSoon ? <SoonTag className="text-[8px]" /> : null}
    </Link>
  );
}

/** Marca nombrada en los grupos que todavía no está cargada: no es un enlace. */
function SoonTile({ name }: { name: string }) {
  return (
    <div aria-label={`${name} · Próximamente`} className={cn(TILE, "min-w-[7.5rem] cursor-default flex-col gap-1 border-dashed border-border bg-card/60")}>
      <BrandName name={name} className="text-[11px] tracking-[0.14em]" />
      <SoonTag className="text-[8px]" />
    </div>
  );
}
