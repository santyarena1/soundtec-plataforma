"use client";

import { LiveRichText } from "@/components/quotes/live-rich-text";

/** Variante encajonada para formularios fuera del documento. */
export function RichTextEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-primary/40 bg-white shadow-sm">
      <LiveRichText value={value} onChange={onChange} ariaLabel={ariaLabel} variant="boxed" />
    </div>
  );
}
