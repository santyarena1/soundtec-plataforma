"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceEditorModal } from "./price-editor-modal";

/** Abre el editor de precios para un producto (ficha del producto). */
export function EditPriceButton({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Tag className="h-4 w-4" /> Editar precio
      </Button>
      {open ? <PriceEditorModal productIds={[productId]} open onClose={() => setOpen(false)} /> : null}
    </>
  );
}
