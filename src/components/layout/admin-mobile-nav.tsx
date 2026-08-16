"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function AdminMobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const drawer =
    mounted && open
      ? createPortal(
          <div className="fixed inset-0 z-[200] xl:hidden" role="dialog" aria-modal="true" aria-label="Menú de admin">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex h-full w-[min(20rem,92vw)] flex-col overflow-hidden border-r border-border bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-sm font-semibold">Menú</p>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary"
                  aria-label="Cerrar menú"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </aside>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        aria-label="Abrir menú"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span>Menú</span>
      </button>
      {drawer}
    </>
  );
}
