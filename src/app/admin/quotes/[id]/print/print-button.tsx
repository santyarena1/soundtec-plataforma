"use client";

import { Button } from "@/components/ui/button";

export function PrintQuoteButton() {
  return (
    <Button type="button" className="print:hidden" onClick={() => window.print()}>
      Imprimir / guardar PDF
    </Button>
  );
}
