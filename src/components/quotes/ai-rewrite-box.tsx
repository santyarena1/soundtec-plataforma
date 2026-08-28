"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { AiChangePreview } from "@/components/quotes/ai-change-preview";

export const REWRITE_PRESETS = [
  { label: "Más largo", instruction: "Hacelo más largo, con el mismo tono institucional de Soundtec." },
  { label: "Más claro", instruction: "Explicálo mejor y más claro, sin perder datos legales ni comerciales." },
  { label: "Más formal", instruction: "Más formal e institucional, tono Soundtec." },
] as const;

type PreviewResult = {
  ok: boolean;
  body?: string;
  previousBody?: string;
  error?: string;
};

export function AiRewriteBox({
  onApply,
  onPreview,
  onConfirmPreview,
  previewTitle = "Módulo",
  pending,
  message,
  warning,
  placeholder = "Pedile a la IA que reescriba este texto…",
  compact = false,
}: {
  /** Aplica directo sin vista previa (legacy). */
  onApply?: (instruction: string) => void;
  /** Genera vista previa antes de aplicar. */
  onPreview?: (instruction: string) => Promise<PreviewResult>;
  /** Confirma el texto ya generado en la vista previa. */
  onConfirmPreview?: (body: string) => Promise<void>;
  previewTitle?: string;
  pending: boolean;
  message?: string | null;
  warning?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{ previousBody: string; nextBody: string } | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [confirmPending, startConfirm] = useTransition();

  function run(value = instruction) {
    const next = value.trim();
    if (next.length < 3 || pending || previewPending) return;

    if (onPreview) {
      startPreview(async () => {
        const result = await onPreview(next);
        if (!result.ok || !result.body) return;
        setPreviewData({
          previousBody: result.previousBody || "",
          nextBody: result.body,
        });
        setPreviewOpen(true);
      });
      return;
    }
    onApply?.(next);
  }

  function confirmPreview() {
    if (!previewData || !onConfirmPreview) return;
    startConfirm(async () => {
      await onConfirmPreview(previewData.nextBody);
      setPreviewOpen(false);
      setPreviewData(null);
      setInstruction("");
    });
  }

  const controls = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        {REWRITE_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || previewPending}
            onClick={() => {
              setInstruction(preset.instruction);
              run(preset.instruction);
            }}
          >
            {preset.label}
          </Button>
        ))}
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={placeholder}
          disabled={pending || previewPending}
          className="h-8 min-w-[160px] flex-1 rounded-md border border-border bg-white px-2 text-xs"
        />
        <Button
          type="button"
          size="sm"
          disabled={pending || previewPending || instruction.trim().length < 3}
          onClick={() => run()}
        >
          {pending || previewPending ? "…" : onPreview ? "Vista previa IA" : "Generar con IA"}
        </Button>
      </div>
      {warning ? <p className="text-[11px] font-medium text-amber-800">{warning}</p> : null}
      {message ? <p className="text-[11px] text-muted-foreground">{message}</p> : null}
    </>
  );

  return (
    <>
      {compact ? <div className="quote-doc__live-chrome space-y-1.5 print:hidden">{controls}</div> : (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 print:hidden">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Copiloto
          </div>
          {controls}
        </div>
      )}
      {previewData ? (
        <AiChangePreview
          open={previewOpen}
          title={previewTitle}
          previousBody={previewData.previousBody}
          nextBody={previewData.nextBody}
          pending={confirmPending}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewData(null);
          }}
          onConfirm={confirmPreview}
        />
      ) : null}
    </>
  );
}
