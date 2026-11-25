"use client";

import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { MenuBoxKind } from "@/lib/brand-layout";
import { BrandLogo, BrandName, SoonTag, useBrokenLogos, type BrandUiCell, type BrandUiItem } from "./brand-ui";
import styles from "./brand-bar.module.css";

/** `group`: la caja entera es un solo enlace al grupo (todas sus marcas juntas). */
export type BrandMenuBox = { kind: MenuBoxKind; cells: BrandUiCell[]; group?: { href: string; label: string } };

type Size = "hero" | "lg" | "md";
const LOGO: Record<Size, string> = { hero: "h-14 sm:h-16", lg: "h-12 sm:h-14", md: "h-10 sm:h-11" };
const COMPACT: Record<Size, string> = { hero: "h-16 w-[8rem]", lg: "h-14 w-[7rem]", md: "h-12 w-[6rem]" };

/**
 * Menú de marcas (pantalla para elegir marca), armado como el boceto: cajas
 * compartidas (Crestron | Crestron Home, Sonance + Blaze), grupos con su marca
 * principal (SoundTube, Atlona) y cajas sueltas de a tres. Cada logo lleva a su marca.
 */
export function BrandMenuClient({ rows, extras }: { rows: BrandMenuBox[][]; extras: BrandUiItem[] }) {
  const root = useRef<HTMLDivElement>(null);
  const { broken, markBroken } = useBrokenLogos(root, [rows, extras]);
  const cellProps = { broken, onBroken: markBroken };

  // Filas seguidas del mismo tipo van en una sola grilla: en el celular se reacomodan sin dejar huecos.
  const sections: Array<{ kind: MenuBoxKind; boxes: BrandMenuBox[] }> = [];
  for (const row of rows) {
    const last = sections[sections.length - 1];
    if (last && last.kind === row[0].kind && row[0].kind !== "group") last.boxes.push(...row);
    else sections.push({ kind: row[0].kind, boxes: [...row] });
  }

  return (
    <div ref={root} className="space-y-3">
      {sections.map((section, index) =>
        section.kind === "group" ? (
          <div key={index} className="space-y-3">
            {section.boxes.map((box, i) => (
              <GroupBox key={i} box={box} {...cellProps} />
            ))}
          </div>
        ) : (
          <div key={index} className={cn("grid gap-3", section.kind === "pair" ? "md:grid-cols-2" : "grid-cols-2 md:grid-cols-3")}>
            {section.boxes.map((box, i) =>
              box.kind === "pair" ? <PairBox key={i} box={box} {...cellProps} /> : (
                <Surface key={i} className="h-24 sm:h-28">
                  <MenuCell cell={box.cells[0]} size="lg" boxed {...cellProps} />
                </Surface>
              )
            )}
          </div>
        )
      )}
      {extras.length ? (
        <div className="pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Más marcas</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {extras.map((brand) => (
              <Surface key={brand.id} className="h-20 sm:h-24">
                <MenuCell cell={{ type: "brand", brand }} size="md" boxed {...cellProps} />
              </Surface>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CellProps = { broken: ReadonlySet<string>; onBroken: (id: string) => void };

const SURFACE = "flex min-w-0 items-stretch rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04)]";

/** Caja del menú. Con `group`, toda la caja es un enlace (y el trazo del borde la recorre entera). */
function Surface({ children, className, group }: { children: React.ReactNode; className?: string; group?: BrandMenuBox["group"] }) {
  if (!group) return <div className={cn(SURFACE, className)}>{children}</div>;
  return (
    <Link
      href={group.href}
      aria-label={group.label}
      title={group.label}
      className={cn(
        SURFACE,
        styles.cell,
        "outline-none transition-[background-color,border-color] duration-200 hover:border-foreground/15 hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
    </Link>
  );
}

function PairBox({ box, ...cellProps }: { box: BrandMenuBox } & CellProps) {
  const linked = !!box.group;
  return (
    <Surface className="h-24 p-1.5 sm:h-28" group={box.group}>
      {box.cells.map((cell, index) => (
        <div key={index} className="flex min-w-0 flex-1">
          {index > 0 ? <span aria-hidden className={cn(styles.divider, "mr-1.5")} /> : null}
          <MenuCell cell={cell} size="lg" linked={linked} {...cellProps} />
        </div>
      ))}
    </Surface>
  );
}

/** Grupo: la principal grande a la izquierda (arriba en el celular) y sus hermanas al lado. */
function GroupBox({ box, ...cellProps }: { box: BrandMenuBox } & CellProps) {
  const [lead, ...rest] = box.cells;
  const linked = !!box.group;
  return (
    <Surface className="flex-col p-1.5 md:h-28 md:flex-row" group={box.group}>
      <div className="flex h-24 md:h-auto md:w-[24%] md:min-w-[12rem] md:max-w-[17rem] md:flex-none">
        <MenuCell cell={lead} size="hero" linked={linked} {...cellProps} />
      </div>
      <span aria-hidden className={cn(styles.divider, styles.dividerResponsive)} />
      <div
        style={{ "--n": rest.length } as React.CSSProperties}
        className={cn("grid min-w-0 flex-1 gap-1 md:pl-1.5", rest.length % 3 !== 0 && rest.length % 2 === 0 ? "grid-cols-2" : "grid-cols-3", "md:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]")}
      >
        {rest.map((cell, index) => (
          <div key={index} className="flex h-16 md:h-auto">
            <MenuCell cell={cell} size="md" linked={linked} {...cellProps} />
          </div>
        ))}
      </div>
    </Surface>
  );
}

/** `linked`: está dentro de una caja-enlace de grupo; se dibuja sin enlace propio. */
function MenuCell({ cell, size, boxed = false, linked = false, broken, onBroken }: { cell: BrandUiCell; size: Size; boxed?: boolean; linked?: boolean } & CellProps) {
  const shape = boxed ? "-m-px rounded-2xl border border-transparent" : "rounded-xl";
  if (cell.type === "soon") {
    return (
      <div
        aria-label={`${cell.name} · Próximamente`}
        className={cn(
          "flex min-w-0 flex-1 cursor-default flex-col items-center justify-center gap-1.5 px-3",
          shape,
          boxed && "bg-[repeating-linear-gradient(135deg,transparent_0_7px,hsl(var(--muted)/0.55)_7px_8px)]"
        )}
      >
        <BrandName name={cell.name} className={size === "md" ? "text-xs" : "text-base"} />
        <SoonTag />
      </div>
    );
  }
  const brand = cell.brand;
  const content = (
    <>
      <BrandLogo brand={brand} heightClass={LOGO[size]} compactClass={COMPACT[size]} broken={broken} onBroken={onBroken} nameClass={size === "md" ? "text-xs" : "text-base"} />
      {brand.comingSoon ? <SoonTag /> : brand.inquiry ? <span className="text-[10px] font-medium leading-none text-primary">Consultá disponibilidad</span> : null}
    </>
  );
  if (linked) return <span className={cn(shape, "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2")}>{content}</span>;
  return (
    <Link
      href={brand.href}
      title={brand.name}
      className={cn(
        styles.cell,
        shape,
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 outline-none transition-colors duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      )}
    >
      {content}
    </Link>
  );
}
