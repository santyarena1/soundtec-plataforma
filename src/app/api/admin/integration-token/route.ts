import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { INTEGRATION_SCOPES, issueIntegrationToken, revokeIntegrationToken, type IntegrationScope } from "@/lib/integration-token";

export const dynamic = "force-dynamic";

const schema = z.object({ scope: z.enum(INTEGRATION_SCOPES), days: z.number().int().min(1).max(14).default(7) });

/** Genera un token temporal de integración (se muestra una sola vez). */
export async function POST(req: Request) {
  const user = await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Pedido inválido" }, { status: 400 });
  try {
    const out = await issueIntegrationToken(parsed.data.scope, parsed.data.days, user.email ?? user.id ?? "admin");
    return NextResponse.json({ ok: true, ...out });
  } catch (error) {
    console.error("[integration-token] issue", error);
    return NextResponse.json({ ok: false, error: "No se pudo generar el token" }, { status: 500 });
  }
}

/** Revoca el token de un alcance. */
export async function DELETE(req: Request) {
  await requireAdmin();
  const scope = new URL(req.url).searchParams.get("scope");
  const valid = INTEGRATION_SCOPES.find((s: IntegrationScope) => s === scope);
  if (!valid) return NextResponse.json({ ok: false, error: "Alcance inválido" }, { status: 400 });
  await revokeIntegrationToken(valid);
  return NextResponse.json({ ok: true });
}
