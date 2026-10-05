"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createExpoQr } from "@/server/actions/expo-events";

export function QrForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-xs" placeholder="Nuevo QR (ej. Folleto)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Button variant="outline" disabled={pending} onClick={() => start(async () => {
        const r = await createExpoQr(eventId, label);
        if (!r.ok) return setError(r.error ?? "Error");
        setLabel(""); setError(null); router.refresh();
      })}>+ Nuevo QR</Button>
      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
