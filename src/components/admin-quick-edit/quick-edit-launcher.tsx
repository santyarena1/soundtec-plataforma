"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, Pencil, X } from "lucide-react";
import { ProductImagesPanel } from "@/app/admin/products/[id]/images-panel";
import { confirmDiscard } from "@/hooks/use-unsaved-changes-guard";
import { loadQuickEdit, type QuickEditData } from "@/server/actions/quick-edit";
import { cn } from "@/lib/utils";
import { TextsTab } from "./texts-tab";
import { ClassificationTab } from "./classification-tab";
import { DocsTab } from "./docs-tab";
import { PricesTab } from "./prices-tab";

type TabKey = "textos" | "fotos" | "precios" | "clasificacion" | "documentos";

const TABS: Array<{ key: TabKey; label: string; prices?: boolean }> = [
  { key: "textos", label: "Textos" },
  { key: "fotos", label: "Fotos y videos" },
  { key: "precios", label: "Precios", prices: true },
  { key: "clasificacion", label: "Clasificación" },
  { key: "documentos", label: "Documentos y accesorios" },
];

/** Parámetro que abre el panel al entrar (lo usa «Editar en la vista del portal» del admin). */
export const QUICK_EDIT_PARAM = "editar";

/**
 * Lápiz flotante de la ficha del portal (solo equipo con permiso, lo decide el
 * servidor antes de montarlo) y el panel lateral de edición rápida.
 * `revision` cambia cuando el servidor vuelve a pintar la ficha con otros datos
 * (fotos, etiquetas, accesorios): el panel relee sin perder lo que se está escribiendo.
 */
export function QuickEditLauncher({ productId, productName, revision, adminHref }: { productId: string; productName: string; revision: string; adminHref: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("textos");
  const [data, setData] = useState<QuickEditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Partial<Record<TabKey, boolean>>>({});
  const [mounted, setMounted] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const anyDirty = Object.values(dirty).some(Boolean);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const result = await loadQuickEdit(productId);
      if (!result.ok) return setError(result.error);
      setError(null);
      setData(result.data);
    } catch {
      setError("No se pudo cargar el producto. Probá de nuevo.");
    }
  }, [productId]);

  // ?editar=1 (o ?editar=precios) abre el panel al entrar.
  useEffect(() => {
    const wanted = params.get(QUICK_EDIT_PARAM);
    if (!wanted) return;
    if (TABS.some((t) => t.key === wanted)) setTab(wanted as TabKey);
    setOpen(true);
  }, [params]);

  useEffect(() => {
    if (open) void load();
  }, [open, revision, load]);

  // Pide la pestaña desde la ficha (lápices chicos del modo edición): evento «quick-edit:open».
  useEffect(() => {
    const onOpen = (event: Event) => {
      const wanted = (event as CustomEvent<string>).detail;
      if (TABS.some((t) => t.key === wanted)) setTab(wanted as TabKey);
      setOpen(true);
    };
    window.addEventListener("quick-edit:open", onOpen);
    return () => window.removeEventListener("quick-edit:open", onOpen);
  }, []);

  const close = useCallback(async () => {
    if (!(await confirmDiscard(anyDirty))) return;
    setOpen(false);
    setDirty({});
    // Saca ?editar de la dirección para que un refresh no lo vuelva a abrir.
    if (params.get(QUICK_EDIT_PARAM)) router.replace(window.location.pathname, { scroll: false });
    fabRef.current?.focus();
  }, [anyDirty, params, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role='dialog'][aria-modal='true']:not([data-quick-edit])")) void close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const onSaved = useCallback(() => {
    router.refresh();
  }, [router]);

  const reportDirty = useCallback((key: TabKey) => (value: boolean) => setDirty((d) => (d[key] === value ? d : { ...d, [key]: value })), []);
  const dirtyHandlers = useRef<Partial<Record<TabKey, (v: boolean) => void>>>({});
  const handlerFor = (key: TabKey) => (dirtyHandlers.current[key] ??= reportDirty(key));

  const tabs = TABS.filter((t) => !t.prices || data?.access.canEditPrices);

  return (
    <>
      <div
        className="group fixed z-[44] print:hidden"
        style={{ right: "max(1rem, env(safe-area-inset-right))", bottom: "max(5.5rem, calc(env(safe-area-inset-bottom) + 5.5rem))" }}
      >
        <span
          role="tooltip"
          className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          Editar producto
        </span>
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Editar producto"
          aria-expanded={open}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.65)] ring-4 ring-background transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 focus-visible:outline-none focus-visible:ring-accent/60 active:scale-95"
        >
          <Pencil className="h-5 w-5" />
          {anyDirty ? <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-primary bg-accent" aria-hidden /> : null}
        </button>
      </div>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex justify-end print:hidden" data-quick-edit>
              <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => void close()} aria-hidden />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label={`Edición rápida: ${productName}`}
                data-quick-edit
                className="relative flex h-full w-full max-w-[44rem] flex-col border-l border-border bg-card shadow-2xl"
              >
                <header className="shrink-0 border-b border-border bg-gradient-to-b from-primary/[0.07] to-transparent px-5 pb-0 pt-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Pencil className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Edición rápida · solo equipo</p>
                      <h2 className="truncate text-base font-semibold leading-tight" title={data?.product.name ?? productName}>
                        {data?.product.name ?? productName}
                      </h2>
                    </div>
                    <Link href={adminHref} className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 sm:inline-flex">
                      Abrir en el admin completo <ExternalLink className="h-3 w-3" />
                    </Link>
                    <button type="button" onClick={() => void close()} aria-label="Cerrar edición rápida" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Secciones">
                    {tabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                          "relative shrink-0 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm transition-colors",
                          tab === t.key ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t.label}
                        {dirty[t.key] ? <span className="ml-1.5 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-accent" aria-label="con cambios sin guardar" /> : null}
                      </button>
                    ))}
                  </nav>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5">
                  {error ? <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
                  {!data ? (
                    <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando el producto…
                    </p>
                  ) : (
                    <>
                      <div hidden={tab !== "textos"} role="tabpanel" className="pb-6">
                        <TextsTab data={data} onSaved={onSaved} onDirty={handlerFor("textos")} />
                      </div>
                      <div hidden={tab !== "fotos"} role="tabpanel" className="pb-6">
                        <ProductImagesPanel productId={data.product.id} productName={data.product.name} media={data.media} />
                      </div>
                      {data.access.canEditPrices ? (
                        <div hidden={tab !== "precios"} role="tabpanel" className="pb-0">
                          <PricesTab productId={data.product.id} active={tab === "precios"} onSaved={onSaved} onDirty={handlerFor("precios")} />
                        </div>
                      ) : null}
                      <div hidden={tab !== "clasificacion"} role="tabpanel">
                        <ClassificationTab data={data} onSaved={onSaved} onDirty={handlerFor("clasificacion")} onHidden={() => router.push(adminHref)} />
                      </div>
                      <div hidden={tab !== "documentos"} role="tabpanel">
                        <DocsTab data={data} onSaved={onSaved} onDirty={handlerFor("documentos")} />
                      </div>
                    </>
                  )}
                  <Link href={adminHref} className="mb-5 mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline sm:hidden">
                    Abrir en el admin completo <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </aside>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
