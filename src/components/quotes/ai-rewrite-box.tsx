"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export const REWRITE_PRESETS = [
  { label: "Hacelo más largo", instruction: "Hacelo más largo, con el mismo tono institucional de Soundtec." },
  { label: "Más claro", instruction: "Explicálo mejor y más claro, sin perder datos legales ni comerciales." },
  { label: "Más institucional", instruction: "Más formal e institucional, tono Soundtec." },
] as const;

export function AiRewriteBox({
  onApply,
  pending,
  message,
  warning,
  placeholder = "Hacelo más largo, más claro, más institucional… o escribí lo que necesites.",
  compact = false,
}: {
  onApply: (instruction: string) => void;
  pending: boolean;
  message?: string | null;
  warning?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [instruction, setInstruction] = useState("");

  function apply(value = instruction) {
    const next = value.trim();
    if (next.length < 3 || pending) return;
    onApply(next);
  }

  if (compact) {
    return (
      <div className="quote-doc__live-chrome space-y-1.5 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          {REWRITE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setInstruction(preset.instruction);
                apply(preset.instruction);
              }}
            >
              {preset.label}
            </Button>
          ))}
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={placeholder}
            disabled={pending}
            className="h-8 min-w-[160px] flex-1 rounded-md border border-border bg-white px-2 text-xs"
          />
          <Button type="button" size="sm" disabled={pending || instruction.trim().length < 3} onClick={() => apply()}>
            {pending ? "…" : "Aplicar"}
          </Button>
        </div>
        {warning ? <p className="text-[11px] font-medium text-amber-800">{warning}</p> : null}
        {message ? <p className="text-[11px] text-muted-foreground">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 print:hidden">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        Copiloto
      </div>
      {warning ? <p className="text-[11px] font-medium text-amber-800">{warning}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {REWRITE_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setInstruction(preset.instruction);
              apply(preset.instruction);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={2}
        placeholder={placeholder}
        disabled={pending}
      />
      <Button type="button" size="sm" disabled={pending || instruction.trim().length < 3} onClick={() => apply()}>
        {pending ? "Reescribiendo…" : "Aplicar instrucción"}
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
