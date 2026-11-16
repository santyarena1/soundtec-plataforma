import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/mailing/unsubscribe-token";
import { UnsubscribeConfirm } from "./unsubscribe-confirm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dejar de recibir mails · Soundtec", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(decodeURIComponent(token));
  const already = payload ? await prisma.mailSuppression.findUnique({ where: { email: payload.email }, select: { reason: true } }) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef0f3] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="h-1.5 bg-primary" />
        <div className="space-y-5 p-7 sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec" width={88} height={52} className="h-auto w-[88px]" />
          {!payload ? (
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">El enlace no es válido</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Puede que se haya cortado al copiarlo. Abrí el enlace «date de baja» desde el mail, o respondé ese mail con la palabra «baja» y te sacamos a mano.
              </p>
            </div>
          ) : (
            <UnsubscribeConfirm token={decodeURIComponent(token)} email={payload.email} alreadyOut={already?.reason === "UNSUBSCRIBE" || already?.reason === "COMPLAINT"} />
          )}
        </div>
      </div>
    </main>
  );
}
