"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { shouldGuardLinkClick } from "@/lib/unsaved-guard/core";
import { confirmLeave, hasUnsavedChanges, isSuspended, resumeGuards, setReleaseHistoryImpl, subscribeGuards } from "@/lib/unsaved-guard/registry";

/**
 * Host del aviso de «cambios sin guardar» (uno solo, en Providers):
 *  - cerrar / recargar la pestaña → aviso nativo del navegador (beforeunload);
 *  - click en <a>/<Link> de la misma pestaña → confirmDialog propio;
 *  - botón «atrás» → mientras haya cambios se agrega una entrada «centinela» al historial
 *    (misma URL); al volver desde ella se pregunta y, si sigue editando, se la repone.
 */

const SENTINEL_KEY = "__unsavedGuard";
const RELEASE_TIMEOUT_MS = 600;

/*
 * Estado a nivel módulo (sobrevive al doble montaje de StrictMode). No se confía en
 * history.state para reconocer la centinela: Next la reescribe en cada server action/refresh.
 * Después de un pushState no quedan entradas «adelante»: desde la centinela solo se puede ir atrás.
 */
let onSentinel = false; // estamos parados sobre la centinela (debajo hay una entrada con la misma URL)
let sentinelPath = "";
let ignorePops = 0;
let releaseWaiters: Array<() => void> = [];

// Solo el path: varias pantallas guardan la solapa activa en el query con replaceState.
const currentPath = () => window.location.pathname;

function pushSentinel() {
  // Copia el estado de Next (__NA, árbol) para que el router la trate como propia.
  window.history.pushState({ ...(window.history.state ?? {}), [SENTINEL_KEY]: true }, "", window.location.href);
  onSentinel = true;
  sentinelPath = currentPath();
}

/** Saca la centinela (vuelve una entrada sin que Next se entere) antes de navegar. */
function releaseSentinel(): Promise<void> {
  if (!onSentinel || currentPath() !== sentinelPath) {
    onSentinel = false;
    return Promise.resolve();
  }
  onSentinel = false;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    releaseWaiters.push(finish);
    ignorePops += 1;
    window.history.back();
    setTimeout(() => {
      if (!done) ignorePops = Math.max(0, ignorePops - 1);
      finish();
    }, RELEASE_TIMEOUT_MS);
  });
}

/*
 * Con cambios → se agrega la centinela. Al guardar no se la saca enseguida (se pisaría con un
 * router.push del mismo botón): queda «vieja» y se descarta al irse por un enlace o con «atrás».
 */
function syncSentinel() {
  if (hasUnsavedChanges() && !onSentinel) pushSentinel();
}

export function UnsavedChangesHost() {
  const router = useRouter();
  const pathname = usePathname();

  // Al cambiar de página termina la pausa de «Salir sin guardar» y la centinela queda atrás.
  useEffect(() => {
    resumeGuards();
    if (onSentinel && currentPath() !== sentinelPath) onSentinel = false;
  }, [pathname]);

  useEffect(() => {
    setReleaseHistoryImpl(releaseSentinel);
    const unsubscribe = subscribeGuards(syncSentinel);
    syncSentinel();

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = ""; // Chrome necesita returnValue para mostrar el aviso nativo
    };

    const onClick = (event: MouseEvent) => {
      const dirty = hasUnsavedChanges();
      if (!dirty && !onSentinel) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | SVGAElement | null;
      if (!anchor) return;
      const decision = shouldGuardLinkClick(
        event,
        {
          href: anchor.getAttribute("href"),
          target: anchor.getAttribute("target"),
          download: anchor.hasAttribute("download"),
          ignore: !!anchor.closest("[data-unsaved-guard='ignore']"),
        },
        window.location.href,
      );
      if (!decision.guard) return;
      // Frena el Link de Next (su onClick corre después, en la raíz de React).
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        if (dirty && !(await confirmLeave())) return;
        await releaseSentinel();
        if (decision.external) window.location.assign(decision.url.href);
        else router.push(`${decision.url.pathname}${decision.url.search}${decision.url.hash}`);
      })();
    };

    const onPopState = (event: PopStateEvent) => {
      if (ignorePops > 0) {
        // Nuestra propia vuelta atrás para sacar la centinela.
        ignorePops -= 1;
        event.stopImmediatePropagation();
        const waiters = releaseWaiters;
        releaseWaiters = [];
        waiters.forEach((resolve) => resolve());
        return;
      }
      if (!onSentinel) return;
      onSentinel = false;
      if (currentPath() !== sentinelPath) return; // saltó varias entradas de golpe: no se puede frenar
      // Se apretó «atrás» desde la centinela: la pantalla sigue siendo la misma.
      event.stopImmediatePropagation();
      if (!hasUnsavedChanges() || isSuspended()) {
        // Centinela vieja (ya se guardó): seguir de largo hasta la página anterior.
        window.history.back();
        return;
      }
      void (async () => {
        if (await confirmLeave()) window.history.back();
        else pushSentinel();
      })();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    // En captura: corre antes que el listener de Next (en la fase «target» van primero los de captura).
    window.addEventListener("popstate", onPopState, true);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [router]);

  return null;
}
