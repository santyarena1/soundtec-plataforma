import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { IMPERSONATION_COOKIE, impersonationSecret, verifyImpersonation } from "@/lib/impersonation/token";
import { closeImpersonationLog } from "@/server/impersonation";

export const dynamic = "force-dynamic";

const REASONS = new Set(["salir", "vencida", "firma", "formato", "sin_clave", "sesion", "admin", "objetivo"]);

/**
 * Sale de «Ver como»: borra la cookie de la vista, cierra el registro y vuelve
 * a la ficha del usuario en el panel. Es lo único que se puede «hacer» durante
 * la vista. No usa los helpers de sesión (que mandan acá cuando la vista no vale).
 */
export async function GET(req: NextRequest) {
  const motivoRaw = req.nextUrl.searchParams.get("motivo") ?? "salir";
  const motivo = REASONS.has(motivoRaw) ? motivoRaw : "salir";
  const raw = cookies().get(IMPERSONATION_COOKIE)?.value;
  const session = await auth().catch(() => null);
  const sessionUserId = session?.user?.id;

  let back = sessionUserId ? "/admin/users" : "/login";
  if (raw) {
    // Se acepta vencida solo para cerrar el registro y volver a la ficha; nunca da acceso.
    const verified = await verifyImpersonation(raw, impersonationSecret(), { ignoreExpiry: true });
    if (verified.ok && verified.payload.a === sessionUserId) {
      await closeImpersonationLog(verified.payload.lid, verified.payload.a, motivo);
      back = `/admin/users/${encodeURIComponent(verified.payload.t)}`;
    }
  }
  const target = new URL(back, req.nextUrl);
  if (motivo !== "salir") target.searchParams.set("vista", motivo);
  const res = NextResponse.redirect(target);
  res.cookies.delete(IMPERSONATION_COOKIE);
  return res;
}
