import Link from "next/link";
import { checkActivationToken } from "@/server/expo/activation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEquipmentBrands } from "@/lib/catalog-brands";
import { ActivateForm } from "./activate-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activá tu cuenta", robots: { index: false } };

const MESSAGES = {
  INVALID: "Este link no es válido.",
  USED: "Este link ya se usó. Si ya creaste tu contraseña, ingresá directamente.",
  EXPIRED: "Este link venció. Escribinos y te mandamos uno nuevo.",
} as const;

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [state, brands] = await Promise.all([checkActivationToken(token), getEquipmentBrands().catch(() => [])]);
  const total = brands.reduce((acc, b) => acc + b.count, 0);
  return (
    <AuthShell
      kicker="Activá tu cuenta"
      title={state.ok ? `Hola ${state.name}` : "No pudimos abrir el link"}
      subtitle={state.ok ? `Creá tu contraseña para ${state.email}.` : undefined}
      brands={brands}
      total={total}
      footer={<p className="text-xs text-[#1E3552]/55">¿Dudas? Escribinos a contacto@soundtec.com.ar</p>}
    >
      {state.ok ? (
        <ActivateForm token={token} email={state.email} />
      ) : (
        <div className="text-center">
          <p>{MESSAGES[state.reason]}</p>
          <Link href="/login" className="mt-5 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">
            Ir a ingresar
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
