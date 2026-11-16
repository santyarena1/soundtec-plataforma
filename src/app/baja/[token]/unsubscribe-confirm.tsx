"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { confirmUnsubscribe } from "@/server/actions/mailing-unsubscribe";

export function UnsubscribeConfirm({ token, email, alreadyOut }: { token: string; email: string; alreadyOut: boolean }) {
  const [done, setDone] = useState(alreadyOut);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (done) {
    return (
      <div className="space-y-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        <h1 className="text-xl font-semibold tracking-tight">Listo, ya no vas a recibir promociones</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sacamos <b className="text-foreground">{email}</b> de todas nuestras listas de novedades y promociones. Los mails de tus pedidos y cotizaciones te siguen llegando normalmente.
        </p>
        <p className="text-sm text-muted-foreground">
          ¿Fue un error? Escribinos a <a className="font-medium text-primary underline" href="mailto:comercial@soundtec.com.ar">comercial@soundtec.com.ar</a> y te volvemos a sumar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">¿Dejar de recibir nuestras promociones?</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Vamos a dejar de mandarle novedades y promociones a <b className="text-foreground">{email}</b>. Los mails de pedidos y cotizaciones no cambian.
        </p>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const result = await confirmUnsubscribe(token);
            if (result.ok) setDone(true);
            else setError(result.error);
          })
        }
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Sí, no quiero recibir más
      </button>
    </div>
  );
}
