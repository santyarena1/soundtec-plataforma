"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { groupSelection, leadTapAction } from "@/lib/brand-layout";
import { cn } from "@/lib/utils";
import { BrandLogo, BrandName, SoonTag, useBrokenLogos, type BrandUiCell, type BrandUiItem } from "./brand-ui";
import styles from "./brand-bar.module.css";

export type BrandBarEntry =
  | { type: "brand"; brand: BrandUiItem }
  | { type: "soon"; name: string }
  | {
      type: "family";
      lead: BrandUiItem;
      /** Submarcas del desplegable (sin la que ya es igual a «Ver todas»). */
      members: BrandUiCell[];
      /** Todas las marcas del grupo, también las virtuales (Crestron Home): para saber si el grupo está elegido. */
      memberIds: string[];
      /** Marcas reales que filtra «Ver todas». */
      groupIds: string[];
      allHref: string;
    };
type FamilyEntry = Extract<BrandBarEntry, { type: "family" }>;

type LogoProps = { broken: ReadonlySet<string>; onBroken: (id: string) => void };

const TILE =
  "flex h-12 min-w-0 flex-none items-center justify-center gap-2 rounded-lg border bg-card px-3 outline-none transition-[background-color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:flex-auto 2xl:h-14";
const ACTIVE = "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]";
const IDLE = "border-border hover:border-foreground/20 hover:bg-muted/30";

/** Lo que se acaba de tocar, antes de que llegue la página nueva: la barra responde ya. */
type Pending = { lead: string; pick: string } | null;

/**
 * Barra de marcas arriba de los resultados. Solo la marca principal de cada
 * grupo: al tocarla filtra ya el grupo entero («Ver todas») y despliega debajo
 * sus hermanas para afinar. Tocarla de nuevo con el grupo entero elegido solo
 * abre o cierra el desplegable (no la deselecciona).
 */
export function BrandBarClient({ entries, activeIds, basePath }: { entries: BrandBarEntry[]; activeIds: string[]; basePath: string }) {
  const root = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { broken, markBroken } = useBrokenLogos(root, [entries]);
  const logoProps = { broken, onBroken: markBroken };

  const families = entries.filter((e): e is FamilyEntry => e.type === "family");
  const activeFamily = families.find((f) => f.memberIds.some((id) => activeIds.includes(id))) ?? null;
  const activeKey = activeIds.join(",");
  const [openId, setOpenId] = useState<string | null>(activeFamily?.lead.id ?? null);
  const [pending, setPending] = useState<Pending>(null);
  // Llegó la página nueva: el desplegable sigue al grupo elegido y se descarta lo provisorio.
  useEffect(() => {
    setOpenId(activeFamily?.lead.id ?? null);
    setPending(null);
  }, [activeFamily?.lead.id, activeKey]);

  const open = families.find((f) => f.lead.id === openId) ?? null;
  // Al cerrar se sigue dibujando el último grupo mientras se pliega.
  const lastOpen = useRef<FamilyEntry | null>(open);
  if (open) lastOpen.current = open;
  const shown = open ?? lastOpen.current;

  // En el celular, la marca elegida queda a la vista dentro de la tira (sin mover la página).
  useEffect(() => {
    const el = strip.current;
    const active = el?.querySelector<HTMLElement>("[data-active='true']");
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, active.offsetLeft - el.offsetLeft - 16);
  }, [activeIds]);

  const allActive = activeIds.length === 0 && !pending;
  const isActive = (id: string) => !pending && activeIds.length === 1 && activeIds[0] === id;

  const tapLead = (event: React.MouseEvent, family: FamilyEntry) => {
    // Abrir en otra pestaña: que el navegador lo haga, sin tocar la barra.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (leadTapAction(activeIds, family.groupIds) === "toggle") {
      event.preventDefault();
      setOpenId((current) => (current === family.lead.id ? null : family.lead.id));
      return;
    }
    // Filtra ya el grupo entero (el Link navega) y abre el desplegable con «Ver todas» marcado.
    setOpenId(family.lead.id);
    setPending({ lead: family.lead.id, pick: "all" });
  };

  return (
    <nav ref={root} aria-label="Marcas" className="relative">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Marcas</h2>
        <Link
          href={`${basePath}?all=1`}
          data-active={allActive}
          aria-current={allActive ? "page" : undefined}
          onClick={() => setOpenId(null)}
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
          if (entry.type === "brand")
            return (
              <BrandTile key={entry.brand.id} brand={entry.brand} active={isActive(entry.brand.id)} onPick={() => setOpenId(null)} {...logoProps} />
            );
          const familyActive = pending ? pending.lead === entry.lead.id : entry.memberIds.some((id) => activeIds.includes(id));
          const expanded = openId === entry.lead.id;
          return (
            <Link
              key={entry.lead.id}
              href={entry.allHref}
              data-lead-id={entry.lead.id}
              data-active={familyActive}
              aria-expanded={expanded}
              aria-controls={panelId}
              title={`${entry.lead.name}: todas sus marcas`}
              onClick={(event) => tapLead(event, entry)}
              className={cn(styles.cell, TILE, "min-w-[8.5rem] pl-4 pr-2.5", familyActive ? ACTIVE : expanded ? "border-foreground/25 bg-muted/40" : IDLE)}
            >
              <BrandLogo brand={entry.lead} heightClass="h-7 2xl:h-8" compactClass="h-9 w-[4.5rem]" nameClass="text-[11px] tracking-[0.12em]" {...logoProps} />
              <span className="flex flex-none items-center gap-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                +{entry.memberIds.length - 1}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none", expanded && "rotate-180")} />
              </span>
            </Link>
          );
        })}
        {/* Se come el espacio que sobra en el último renglón: así esas cajas no se estiran de más. */}
        <span aria-hidden className="hidden md:block md:flex-[999_1_0%]" />
      </div>

      <div id={panelId} className={styles.panelWrap} data-open={open ? "true" : "false"} aria-hidden={open ? undefined : true}>
        <div className={styles.panelClip}>
          {shown ? (
            <FamilyPanel
              family={shown}
              rootRef={root}
              stripRef={strip}
              selected={pending?.lead === shown.lead.id ? pending.pick : groupSelection(activeIds, shown.groupIds, shown.memberIds)}
              onPick={(pick) => setPending({ lead: shown.lead.id, pick })}
              {...logoProps}
            />
          ) : null}
        </div>
      </div>
    </nav>
  );
}

/**
 * Desplegable de un grupo: «Ver todas» + submarcas. Una flecha lo une con la
 * principal elegida y un realce se desliza hasta lo elegido. Las submarcas
 * entran en cascada (con «reducir movimiento», sin animación).
 */
function FamilyPanel({
  family,
  selected,
  onPick,
  rootRef,
  stripRef,
  broken,
  onBroken,
}: {
  family: FamilyEntry;
  selected: string | null;
  onPick: (pick: string) => void;
  rootRef: React.RefObject<HTMLElement>;
  stripRef: React.RefObject<HTMLDivElement>;
} & LogoProps) {
  const row = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [mark, setMark] = useState<{ x: number; y: number; w: number } | null>(null);

  // Flecha: al centro de la principal (sigue a la tira si se desplaza en el celular).
  const placeCaret = useCallback(() => {
    const nav = rootRef.current;
    const lead = nav?.querySelector<HTMLElement>(`[data-lead-id="${CSS.escape(family.lead.id)}"]`);
    if (!nav || !lead) return;
    const navBox = nav.getBoundingClientRect();
    const box = lead.getBoundingClientRect();
    const x = box.left + box.width / 2 - navBox.left;
    setCaret(Math.max(16, Math.min(navBox.width - 16, x)));
  }, [family.lead.id, rootRef]);

  // Realce: debajo de lo elegido («Ver todas» o una submarca).
  const placeMark = useCallback(() => {
    const el = selected ? row.current?.querySelector<HTMLElement>(`[data-pick="${CSS.escape(selected)}"]`) : null;
    setMark(el ? { x: el.offsetLeft, y: el.offsetTop + el.offsetHeight, w: el.offsetWidth } : null);
  }, [selected, family.lead.id]);

  useLayoutEffect(() => {
    placeCaret();
    placeMark();
  }, [placeCaret, placeMark]);

  useEffect(() => {
    const strip = stripRef.current;
    const onResize = () => {
      placeCaret();
      placeMark();
    };
    window.addEventListener("resize", onResize);
    strip?.addEventListener("scroll", placeCaret, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      strip?.removeEventListener("scroll", placeCaret);
    };
  }, [placeCaret, placeMark, stripRef]);

  const allOn = selected === "all";
  return (
    <div className={styles.panelInner}>
      {caret != null ? <span aria-hidden className={styles.caret} style={{ transform: `translateX(${caret}px)` }} /> : null}
      {/* Con la clave del grupo: al pasar a otro grupo las submarcas vuelven a entrar en cascada; la flecha se desliza. */}
      <div key={family.lead.id} className={cn(styles.panel, "rounded-xl border border-border bg-card p-2 shadow-sm")}>
        <p className={cn(styles.stagger, "mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground")} style={{ "--i": 0 } as React.CSSProperties}>
          {family.lead.name} y sus marcas
        </p>
        <div ref={row} className={cn(styles.strip, "relative -mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0")}>
          <Link
            href={family.allHref}
            data-pick="all"
            data-active={allOn}
            aria-current={allOn ? "page" : undefined}
            onClick={() => onPick("all")}
            style={{ "--i": 1 } as React.CSSProperties}
            className={cn(
              styles.cell,
              styles.stagger,
              "inline-flex h-11 flex-none items-center gap-1.5 rounded-lg border px-4 text-xs font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring 2xl:h-12",
              allOn ? "border-primary bg-primary/[0.06] text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            Ver todas
            <span className={cn("tabular-nums", allOn ? "text-primary" : "text-muted-foreground")}>{family.memberIds.length}</span>
          </Link>
          {family.members.map((cell, index) =>
            cell.type === "soon" ? (
              <SoonTile key={`soon-${cell.name}`} name={cell.name} index={index + 2} />
            ) : (
              <BrandTile
                key={cell.brand.id}
                brand={cell.brand}
                active={selected === cell.brand.id}
                pick={cell.brand.id}
                onPick={() => onPick(cell.brand.id)}
                index={index + 2}
                small
                broken={broken}
                onBroken={onBroken}
              />
            )
          )}
          {/* Como en la barra: el último renglón no estira sus cajas. */}
          <span aria-hidden className="hidden md:block md:flex-[999_1_0%]" />
          {mark ? <span aria-hidden className={styles.mark} style={{ transform: `translate(${mark.x}px, ${mark.y + 3}px) scaleX(${mark.w / 100})` }} /> : null}
        </div>
      </div>
    </div>
  );
}

function BrandTile({
  brand,
  active,
  small = false,
  pick,
  index,
  onPick,
  broken,
  onBroken,
}: { brand: BrandUiItem; active: boolean; small?: boolean; pick?: string; index?: number; onPick?: () => void } & LogoProps) {
  return (
    <Link
      href={brand.href}
      data-active={active}
      data-pick={pick}
      aria-current={active ? "page" : undefined}
      onClick={onPick}
      title={brand.comingSoon ? `${brand.name} · Próximamente` : brand.name}
      style={index != null ? ({ "--i": index } as React.CSSProperties) : undefined}
      className={cn(
        styles.cell,
        index != null && styles.stagger,
        TILE,
        small ? "h-11 min-w-[7.5rem] 2xl:h-12" : "min-w-[7.5rem]",
        "flex-col gap-0.5",
        brand.caption !== undefined && "flex-row gap-2 pl-2",
        active ? ACTIVE : IDLE
      )}
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
function SoonTile({ name, index }: { name: string; index?: number }) {
  return (
    <div
      aria-label={`${name} · Próximamente`}
      style={index != null ? ({ "--i": index } as React.CSSProperties) : undefined}
      className={cn(TILE, index != null && styles.stagger, "min-w-[7.5rem] cursor-default flex-col gap-1 border-dashed border-border bg-card/60")}
    >
      <BrandName name={name} className="text-[11px] tracking-[0.14em]" />
      <SoonTag className="text-[8px]" />
    </div>
  );
}
