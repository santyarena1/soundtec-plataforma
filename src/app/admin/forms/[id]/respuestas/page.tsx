import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Inbox, Pencil } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { loadFormResponses } from "@/lib/forms/responses";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteResponseButton } from "./delete-response-button";

export const metadata = { title: "Admin · Respuestas del formulario" };

const dateTime = (d: Date) =>
  d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function FormResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("forms.manage");
  const { id } = await params;
  const data = await loadFormResponses(id);
  if (!data) notFound();
  const { form, columns, rows, summaries } = data;

  return (
    <div className="space-y-6">
      <Link href="/admin/forms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Formularios
      </Link>
      <PageHeader
        title={form.title}
        description={`${rows.length} respuesta${rows.length === 1 ? "" : "s"}${rows[0] ? ` · la última el ${dateTime(rows[0].submittedAt)}` : ""}`}
        actions={
          <>
            <Link href={`/admin/forms/${form.id}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary">
              <Pencil className="h-4 w-4" /> Editar formulario
            </Link>
            {rows.length ? (
              <a href={`/api/admin/forms/${form.id}/export`} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Download className="h-4 w-4" /> Descargar Excel
              </a>
            ) : null}
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={<Inbox className="h-5 w-5" />} title="Todavía no hay respuestas" description="Cuando alguien complete el formulario desde el enlace, aparece acá." />
      ) : (
        <>
          {summaries.length ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {summaries.map((s) => {
                const max = Math.max(1, ...s.counts.map((c) => c.count));
                return (
                  <div key={s.column.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <p className="text-sm font-semibold leading-snug">{s.column.title}</p>
                    <p className="mb-3 text-xs text-muted-foreground">{s.total} respondieron</p>
                    <ul className="space-y-1.5">
                      {s.counts.map((c) => (
                        <li key={c.label} className="text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="truncate">{c.label}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {c.count}
                              {s.total ? ` · ${Math.round((c.count / s.total) * 100)}%` : ""}
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[#1e3553] text-left text-[11px] font-semibold uppercase tracking-wide text-white">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-[#1e3553] px-3 py-2.5">Fecha</th>
                    {columns.map((c) => (
                      <th key={c.id} className="max-w-[16rem] px-3 py-2.5 align-bottom" title={c.title}>
                        <span className="line-clamp-2 normal-case">{c.title}</span>
                        {c.removed ? <span className="block text-[10px] font-normal normal-case text-white/60">(quitada)</span> : null}
                      </th>
                    ))}
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={`border-b border-border align-top ${i % 2 ? "bg-secondary/20" : ""}`}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-3 py-2.5 text-xs text-muted-foreground" style={{ background: "inherit" }}>
                        {dateTime(r.submittedAt)}
                      </td>
                      {columns.map((c) => (
                        <td key={c.id} className="max-w-[18rem] px-3 py-2.5">
                          <span className="line-clamp-4 whitespace-pre-wrap break-words">{r.cells[c.id] || <span className="text-muted-foreground/50">—</span>}</span>
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <DeleteResponseButton responseId={r.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
