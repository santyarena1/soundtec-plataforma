"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveAccountRequest, rejectAccountRequest } from "@/server/actions/account-requests";

export function RequestActions({ id, phone, name }: { id: string; phone: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; mailSent: boolean } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const approve = () =>
    start(async () => {
      const r = await approveAccountRequest(id);
      if (!r.ok) return setError(r.error);
      setLink({ url: r.activationUrl, mailSent: r.mailSent });
      router.refresh();
    });
  const reject = () =>
    start(async () => {
      const r = await rejectAccountRequest(id, reason);
      if (!r.ok) return setError(r.error ?? "Error");
      router.refresh();
    });

  if (link) {
    const wa = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
      `Hola ${name}, tu cuenta de Soundtec está aprobada. Creá tu contraseña acá: ${link.url}`
    )}`;
    return (
      <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
        <p className="font-semibold text-emerald-800">
          Aprobada. {link.mailSent ? "Le enviamos el mail." : "Mandale el link de activación (vence en 72 h):"}
        </p>
        <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link.url)}>Copiar</Button>
          <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white">
            Enviar por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rejecting ? (
        <div className="flex gap-2">
          <Input placeholder="Motivo del rechazo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="destructive" onClick={reject} disabled={pending}>Rechazar</Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={approve} disabled={pending}>{pending ? "Aprobando…" : "Aprobar"}</Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={pending}>Rechazar</Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
