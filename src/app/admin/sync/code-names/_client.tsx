"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui/table";
import { applyCodeNames, type CodeNameChange } from "@/server/actions/product-code-names";

const PREVIEW_LIMIT = 300;

export function CodeNamesPanel({ changes }: { changes: CodeNameChange[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [brand, setBrand] = useState("");

  const byBrand = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of changes) counts.set(c.brand || "—", (counts.get(c.brand || "—") ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [changes]);

  const visible = useMemo(
    () => (brand ? changes.filter((c) => (c.brand || "—") === brand) : changes),
    [changes, brand]
  );

  function apply() {
    if (!window.confirm(`Se van a renombrar ${changes.length} productos. ¿Continuar?`)) return;
    startTransition(async () => {
      const result = await applyCodeNames();
      setMessage(
        result.ok
          ? { ok: true, text: `Listo: ${result.updated} productos renombrados.` }
          : { ok: false, text: result.error ?? "Error al renombrar." }
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">{changes.length} productos para renombrar</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setBrand("")}
                className={brand ? "text-muted-foreground hover:underline" : "font-semibold"}
              >
                Todas
              </button>
              {byBrand.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setBrand(name)}
                  className={brand === name ? "font-semibold" : "text-muted-foreground hover:underline"}
                >
                  {name} ({count})
                </button>
              ))}
            </div>
          </div>
          <Button onClick={apply} disabled={pending || changes.length === 0}>
            {pending ? "Renombrando…" : "Aplicar a todos"}
          </Button>
        </CardContent>
      </Card>

      {message && (
        <p className={message.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>{message.text}</p>
      )}

      <Table>
        <THead>
          <TR>
            <TH>Marca</TH>
            <TH>Nombre actual</TH>
            <TH>Nombre nuevo</TH>
          </TR>
        </THead>
        <TBody>
          {visible.length === 0 ? (
            <TableEmpty message="No hay productos para renombrar." />
          ) : (
            visible.slice(0, PREVIEW_LIMIT).map((c) => (
              <TR key={c.id}>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">{c.brand || "—"}</TD>
                <TD className="text-xs">{c.from}</TD>
                <TD className="font-mono text-xs font-semibold">{c.to}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
      {visible.length > PREVIEW_LIMIT && (
        <p className="text-xs text-muted-foreground">
          Mostrando {PREVIEW_LIMIT} de {visible.length}. Al aplicar se renombran todos.
        </p>
      )}
    </div>
  );
}
