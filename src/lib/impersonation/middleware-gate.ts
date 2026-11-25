import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_EXIT_PATH, READ_ONLY_MESSAGE, impersonationSecret, verifyImpersonation } from "@/lib/impersonation/token";
import { decideDuringImpersonation, portalEquivalent } from "@/lib/impersonation/request-guard";

/**
 * Middleware de «Ver como»: con la cookie de la vista presente (válida o no),
 * ningún envío pasa — Server Actions, POST/PUT/PATCH/DELETE de la API, cerrar
 * sesión —, salvo la salida. Una vista vencida o ajena lleva a la salida.
 * Devuelve null para seguir con el middleware normal.
 */
export async function impersonationGate(req: NextRequest, cookieValue: string, sessionUserId: string | undefined): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;
  const decision = decideDuringImpersonation({ method: req.method, pathname, headers: req.headers });
  if (decision === "exit") return NextResponse.next();
  if (decision === "block") {
    return NextResponse.json({ ok: false, error: READ_ONLY_MESSAGE, readOnlyView: true }, { status: 403, headers: { "x-read-only-view": "1" } });
  }
  const verified = await verifyImpersonation(cookieValue, impersonationSecret());
  if (verified.ok && verified.payload.a === sessionUserId) {
    // Viendo como un cliente: el catálogo público pasa a su portal (precios, condiciones y visibilidad de él).
    const portal = verified.payload.tr === "CLIENT" ? portalEquivalent(pathname) : null;
    if (!portal) return null;
    const target = new URL(portal, req.nextUrl);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target);
  }
  // La API la resuelven los helpers (redirigen a la salida); acá solo las pantallas.
  if (pathname.startsWith("/api/")) return null;
  const exit = new URL(IMPERSONATION_EXIT_PATH, req.nextUrl);
  exit.searchParams.set("motivo", verified.ok ? "sesion" : verified.reason);
  return NextResponse.redirect(exit);
}
