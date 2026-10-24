"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { draftTextVariantWithAI } from "@/server/actions/quote-text-variants";
import { PROFILE_OPTIONS } from "./variant-conditions";

/**
 * Escribe una versión con IA a partir del texto general. Devuelve el borrador
 * al editor: no se guarda hasta tocar «Guardar».
 */
export function AiDraftPanel({
  blockKey,
  baseBody,
  audienceOptions,
  initialAudience,
  initialProfile,
  onDraft,
}: {
  blockKey: string;
  baseBody: string;
  audienceOptions: { key: string; label: string }[];
  initialAudience: string;
  initialProfile: string;
  onDraft: (body: string, picked: { audience: string; profile: string }) => void;
}) {
  const [audience, setAudience] = useState(initialAudience);
  const [profile, setProfile] = useState(initialProfile);
  const [instruction, setInstruction] = useState("");
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const result = await draftTextVariantWithAI({ blockKey, baseBody, audience: audience || null, profile: profile || null, instruction });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDraft(result.body, { audience, profile });
      toast.success("Listo el borrador. Revisalo y tocá Guardar.");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Escribirla con IA a partir del texto general
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select aria-label="A quién va" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="">Cualquier rubro</option>
          {audienceOptions.map((a) => (
            <option key={a.key} value={a.key}>
              Para {a.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Tipo de presupuesto" value={profile} onChange={(e) => setProfile(e.target.value)}>
          <option value="">Cualquier tipo</option>
          {PROFILE_OPTIONS.map((p) => (
            <option key={p.key} value={p.key}>
              Presupuesto {p.label}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        rows={2}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Opcional: qué más cambiar. Ej. «más corto», «mencioná el servicio de mantenimiento»"
        aria-label="Indicaciones para la IA"
      />
      <Button type="button" size="sm" variant="outline" onClick={generate} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? "Escribiendo…" : "Escribir borrador"}
      </Button>
      <p className="text-xs text-muted-foreground">Conserva los datos del texto general (garantías, certificaciones, alcances). No inventa clientes ni cifras.</p>
    </div>
  );
}
