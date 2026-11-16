"use client";

import { useRouter } from "next/navigation";
import { Database, FileSpreadsheet } from "lucide-react";
import { DynamicListForm } from "@/components/mailing/dynamic-list-form";
import { ImportWizard } from "@/components/mailing/import-wizard";
import type { FilterOptions } from "@/lib/mailing/filter-options";

export function ListsManager({ options, importTargets }: { options: FilterOptions; importTargets: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Database className="h-4 w-4 text-primary" /> Lista desde la base
          </h2>
          <p className="text-sm text-muted-foreground">Clientes, usuarios del portal, interesados o solicitudes, filtrados por rubro, responsable, provincia…</p>
        </div>
        <DynamicListForm options={options} onSaved={() => router.refresh()} />
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Importar Excel o CSV
          </h2>
          <p className="text-sm text-muted-foreground">Contactos de una feria, una base de otro sistema, una planilla de un vendedor.</p>
        </div>
        <ImportWizard targets={importTargets} onDone={() => router.refresh()} />
      </section>
    </div>
  );
}
