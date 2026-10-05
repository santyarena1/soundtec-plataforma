import Link from "next/link";
import { checkActivationToken } from "@/server/expo/activation";
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
  const state = await checkActivationToken(token);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/logo_soundtec.png" alt="Soundtec" className="mx-auto mb-6 h-10 w-auto" />
      {state.ok ? (
        <>
          <h1 className="text-center text-2xl font-semibold">Hola {state.name}</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">Creá tu contraseña para {state.email}.</p>
          <ActivateForm token={token} email={state.email} />
        </>
      ) : (
        <div className="text-center">
          <p>{MESSAGES[state.reason]}</p>
          <p className="mt-4 text-sm"><Link href="/login" className="underline">Ir a ingresar</Link> · contacto@soundtec.com.ar</p>
        </div>
      )}
    </main>
  );
}
