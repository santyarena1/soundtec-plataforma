"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { DynamicListForm } from "@/components/mailing/dynamic-list-form";
import { ImportWizard } from "@/components/mailing/import-wizard";
import type { AudienceQuery } from "@/lib/mailing/audience";
import type { FilterOptions } from "@/lib/mailing/filter-options";
import { removeListMembers, renameList } from "@/server/actions/mailing-lists";
import { ListRowActions } from "../list-row-actions";

type Member = { id: string; email: string; name: string; company: string; fields: string };

type Props =
  | { mode: "dynamic"; list: { id: string; name: string; description: string }; query: AudienceQuery; options: FilterOptions }
  | { mode: "imported"; list: { id: string; name: string; description: string }; members: Member[]; total: number; suppressed: number; page: number; pages: number; q: string };

export function ListDetailClient(props: Props) {
  const router = useRouter();
  if (props.mode === "dynamic") {
    return (
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{props.list.name}</h1>
            <p className="text-sm text-muted-foreground">Lista desde la base: se recalcula en cada envío.</p>
          </div>
          <ListRowActions id={props.list.id} name={props.list.name} />
        </div>
        <DynamicListForm options={props.options} initial={{ ...props.list, query: props.query }} onSaved={() => router.refresh()} />
      </section>
    );
  }
  return <ImportedList {...props} />;
}

function ImportedList({ list, members, total, suppressed, page, pages, q }: Extract<Props, { mode: "imported" }>) {
  const router = useRouter();
  const [name, setName] = useState(list.name);
  const [busy, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  // El nombre editado y sin guardar (después del refresh list.name trae el guardado).
  useUnsavedChangesGuard(name !== list.name);
  const href = (p: number) => `/admin/mailing/listas/${list.id}?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Lista importada</p>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="text-lg font-semibold" aria-label="Nombre de la lista" />
          </div>
          <Button
            variant="outline"
            disabled={busy || name === list.name}
            onClick={() =>
              start(async () => {
                const result = await renameList({ id: list.id, name, description: list.description });
                if (!result.ok) return void toast.error(result.error);
                toast.success("Nombre guardado.");
                router.refresh();
              })
            }
          >
            <Save className="h-4 w-4" /> Guardar nombre
          </Button>
          <ListRowActions id={list.id} name={list.name} />
        </div>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString("es-AR")} personas{q ? " con esa búsqueda" : ""}
          {suppressed ? ` · ${suppressed.toLocaleString("es-AR")} están dadas de baja o rebotaron: no les llega aunque sigan en la lista` : ""}.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Sumar más personas</h2>
        <ImportWizard targets={[]} fixedListId={list.id} onDone={() => router.refresh()} />
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <form action={`/admin/mailing/listas/${list.id}`} className="min-w-[220px] flex-1">
            <input name="q" defaultValue={q} placeholder="Buscar por mail, nombre o empresa" className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
          </form>
          {selected.length ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await confirmDialog({ message: `¿Sacar ${selected.length} personas de la lista?`, confirmLabel: "Sacar", tone: "danger" });
                if (!ok) return;
                start(async () => {
                  const result = await removeListMembers({ listId: list.id, ids: selected });
                  if (!result.ok) return void toast.error(result.error);
                  setSelected([]);
                  router.refresh();
                });
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Sacar {selected.length}
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 py-2">
                  <input type="checkbox" aria-label="Elegir todos" checked={members.length > 0 && selected.length === members.length} onChange={(e) => setSelected(e.target.checked ? members.map((m) => m.id) : [])} />
                </th>
                <th className="py-2 pr-3 font-medium">Mail</th>
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 font-medium">Otros datos</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="py-1.5">
                    <input type="checkbox" aria-label={`Elegir ${m.email}`} checked={selected.includes(m.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))} />
                  </td>
                  <td className="py-1.5 pr-3 font-medium">{m.email}</td>
                  <td className="py-1.5 pr-3">{m.name}</td>
                  <td className="py-1.5 pr-3">{m.company}</td>
                  <td className="max-w-[280px] truncate py-1.5 text-xs text-muted-foreground">{m.fields}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Página {page} de {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={href(page - 1)} className="rounded-md border border-border px-2.5 py-1 hover:bg-secondary">
                  Anterior
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={href(page + 1)} className="rounded-md border border-border px-2.5 py-1 hover:bg-secondary">
                  Siguiente
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
