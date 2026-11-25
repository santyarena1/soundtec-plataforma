"use client";

import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { refreshMailboxAction } from "@/server/actions/mail-viewer";

/**
 * Piezas de cliente del visor: precarga de mensajes, buscador sin recargar la
 * página y «Actualizar» que solo descarta lo que cambia.
 */

const PRELOAD_PATH = "/api/admin/correo/precarga";
/** Al pasar el mouse: si se queda este tiempo, se precarga (un roce no cuenta). */
const HOVER_DELAY_MS = 120;
const MAX_WARM = 3;

// Lo ya precargado en esta pestaña (el servidor lo tiene 10 min en memoria).
const preloaded = new Set<string>();

function preload(folder: string, uids: number[]): void {
  const fresh = uids.filter((uid) => !preloaded.has(`${folder}:${uid}`));
  if (!fresh.length) return;
  fresh.forEach((uid) => preloaded.add(`${folder}:${uid}`));
  const params = new URLSearchParams({ carpeta: folder });
  fresh.forEach((uid) => params.append("uid", String(uid)));
  fetch(`${PRELOAD_PATH}?${params}`, { method: "POST", credentials: "same-origin" }).catch(() => fresh.forEach((uid) => preloaded.delete(`${folder}:${uid}`)));
}

/** Enlace a un mensaje que lo precarga en el servidor al pasar el mouse (o al enfocarlo). */
export function MessageLink({ href, folder, uid, className, current, children }: { href: string; folder: string; uid: number; className?: string; current?: boolean; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    if (timer.current) return;
    timer.current = setTimeout(() => preload(folder, [uid]), HOVER_DELAY_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <Link href={href} scroll={false} className={className} aria-current={current ? "true" : undefined} onMouseEnter={start} onMouseLeave={stop} onFocus={start} onBlur={stop}>
      {children}
    </Link>
  );
}

/** Al mostrar el listado, precarga los primeros mensajes cuando el navegador está libre. */
export function WarmMessages({ folder, uids }: { folder: string; uids: number[] }) {
  const key = `${folder}:${uids.slice(0, MAX_WARM).join(",")}`;
  useEffect(() => {
    const list = uids.slice(0, MAX_WARM);
    if (!list.length) return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = () => preload(folder, list);
    if (idle) idle(run, { timeout: 1500 });
    else setTimeout(run, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/**
 * Formulario GET que navega del lado del cliente (sin recargar toda la página):
 * arma la URL con los campos que tienen valor.
 */
export function ViewerGetForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget)) if (typeof value === "string" && value !== "") params.append(name, value);
    start(() => router.push(`${action}?${params}`, { scroll: false }));
  };
  return (
    <form action={action} onSubmit={onSubmit} className={className} aria-busy={pending || undefined} data-pending={pending ? "" : undefined}>
      {children}
    </form>
  );
}

/** «Actualizar»: descarta carpetas, listados y actividad (no los mensajes ya abiertos) y vuelve a pedir. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await refreshMailboxAction();
          if (!result.ok) toast.error(result.error);
          router.refresh();
        })
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-secondary disabled:opacity-60"
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Actualizando…" : "Actualizar"}
    </button>
  );
}
