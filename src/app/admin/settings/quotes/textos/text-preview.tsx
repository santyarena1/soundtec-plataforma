"use client";

import { QuoteBody } from "@/components/quotes/quote-body";

/** Cómo sale este texto en la hoja del PDF (misma letra, título y color). */
export function TextPreview({ title, body, color }: { title: string; body: string; color: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <p className="border-b border-border bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">Así sale en el PDF</p>
      <div className="quote-doc max-h-[32rem] overflow-y-auto px-5 py-4" style={{ width: "100%" }}>
        <h2
          className="mb-[2.5mm] border-b pb-[1mm] text-[11pt] font-bold uppercase tracking-[0.08em]"
          style={{ color, borderColor: color }}
        >
          {title}
        </h2>
        {body.trim() ? <QuoteBody body={body} /> : <p className="text-sm italic text-muted-foreground">Vacío</p>}
      </div>
    </div>
  );
}
