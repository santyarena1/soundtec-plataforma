import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEquipmentBrands, totalProducts } from "@/lib/catalog-brands";
import { countCustomerVisibleProducts } from "@/lib/catalog";
import { checkResetToken } from "@/server/auth/password-reset";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";
// El token va en la dirección: que no se filtre a otros sitios por el Referer.
export const metadata = { title: "Elegí una clave nueva", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

const MESSAGES = {
  INVALID: "Este link no es válido.",
  USED: "Este link ya se usó. Si ya cambiaste la clave, ingresá con la nueva.",
  EXPIRED: "Este link venció (dura 1 hora). Pedí uno nuevo.",
} as const;

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [state, brands] = await Promise.all([checkResetToken(token), getEquipmentBrands().catch(() => [])]);
  const total = await countCustomerVisibleProducts().catch(() => totalProducts(brands));
  return (
    <AuthShell
      kicker="Recuperar acceso"
      title={state.ok ? "Elegí una clave nueva" : "No pudimos abrir el link"}
      subtitle={state.ok ? `Para ${state.email}.` : undefined}
      brands={brands}
      total={total}
    >
      {state.ok ? (
        <ResetForm token={token} />
      ) : (
        <div className="space-y-4 text-center">
          <p>{MESSAGES[state.reason]}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/olvide-clave" className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">
              Pedir otro link
            </Link>
            <Link href="/login" className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold">
              Ir a ingresar
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
