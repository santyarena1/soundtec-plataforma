import { Suspense } from "react";
import { getImpersonation } from "@/lib/auth-helpers";
import { USER_TYPE_LABEL } from "@/server/users-ui";
import { ImpersonationBar } from "@/components/impersonation/impersonation-bar";

// Botones deshabilitados a la vista, y lo que queda pegado arriba (encabezados) baja lo que mide la franja.
const READ_ONLY_CSS = [
  "html[data-read-only-view] [data-read-only-marked]{opacity:.5;cursor:not-allowed}",
  "html[data-read-only-view] .sticky.top-0:not([data-ver-como-bar]){top:var(--ver-como-h,0px)}",
].join("");

/** Franja de «Ver como» arriba de todo (panel y portal), solo con una vista activa. */
export async function ImpersonationBanner() {
  const view = await getImpersonation();
  if (!view) return null;
  const { target, actor } = view;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: READ_ONLY_CSS }} />
      <Suspense fallback={null}>
        <ImpersonationBar
          targetName={target.name || target.email || "Usuario"}
          companyName={target.clientName ?? target.companyName}
          roleLabel={USER_TYPE_LABEL[target.role] ?? target.role}
          actorName={`Admin: ${actor.name || actor.email || "—"}`}
          expiresAt={view.expiresAt}
        />
      </Suspense>
    </>
  );
}
