"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { saveAssistantPricing } from "@/server/actions/ai-pricing";

/**
 * Tarifa del modelo. Los tokens se miden, pero el precio por token depende del
 * modelo y del plan de cada cuenta, así que lo declara el admin en vez de
 * quedar escrito en el código.
 */
export function PricingEditor({
  input,
  output,
  configured,
}: {
  input: number;
  output: number;
  configured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState({ input: String(input), output: String(output) });

  async function save() {
    setPending(true);
    try {
      const result = await saveAssistantPricing({
        inputPerMillion: values.input,
        outputPerMillion: values.output,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Tarifa guardada.");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {configured ? "Ajustar tarifa" : "Tarifa sin confirmar · cargar la real"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tarifa del modelo"
        description="Precio en dólares por millón de tokens, según tu cuenta de OpenAI. Los tokens consumidos se miden y se guardan en cada respuesta; esto solo define a cuánto se valúan."
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="price-input">Entrada (USD por millón)</Label>
            <Input
              id="price-input"
              inputMode="decimal"
              value={values.input}
              onChange={(event) => setValues((prev) => ({ ...prev, input: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="price-output">Salida (USD por millón)</Label>
            <Input
              id="price-output"
              inputMode="decimal"
              value={values.output}
              onChange={(event) => setValues((prev) => ({ ...prev, output: event.target.value }))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Lo encontrás en la página de precios de OpenAI o en el detalle de tu factura.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
