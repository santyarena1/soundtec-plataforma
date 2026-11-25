import { NextResponse, type NextRequest } from "next/server";
import { getImpersonation } from "@/lib/auth-helpers";
import { IMPERSONATION_COOKIE, IMPERSONATION_EXIT_PATH, newPayload, safeReturnPath } from "@/lib/impersonation/token";
import { prisma } from "@/lib/prisma";
import { IMPERSONATION_COOKIE_OPTIONS, buildImpersonationToken, renewImpersonationLog } from "@/server/impersonation";

export const dynamic = "force-dynamic";

/**
 * «Renovar»: la vista dura 30 minutos; esto la extiende otros 30 desde ahora.
 * Solo con una vista todavía válida (firma, vencimiento y estado en la base).
 */
export async function GET(req: NextRequest) {
  const back = safeReturnPath(req.nextUrl.searchParams.get("volver"), "/");
  const view = await getImpersonation();
  if (!view) return NextResponse.redirect(new URL(`${IMPERSONATION_EXIT_PATH}?motivo=vencida`, req.nextUrl));
  const actor = await prisma.user.findUnique({ where: { id: view.actor.id }, select: { sessionVersion: true } });
  if (!actor) return NextResponse.redirect(new URL(`${IMPERSONATION_EXIT_PATH}?motivo=admin`, req.nextUrl));
  const token = await buildImpersonationToken(newPayload({ adminId: view.actor.id, targetId: view.target.id, sessionVersion: actor.sessionVersion, logId: view.logId, targetRole: view.target.role }));
  await renewImpersonationLog(view.logId, view.actor.id);
  const res = NextResponse.redirect(new URL(back, req.nextUrl));
  res.cookies.set(IMPERSONATION_COOKIE, token, IMPERSONATION_COOKIE_OPTIONS);
  return res;
}
