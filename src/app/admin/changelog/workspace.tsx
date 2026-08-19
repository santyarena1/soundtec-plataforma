"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-button";
import { ChangelogForm } from "@/components/admin/changelog-form";
import { ChangelogEntryCard, ChangelogTimeline } from "@/components/admin/changelog-timeline";
import { deleteChangelog } from "@/server/actions/changelog";
import type { ChangelogEntryView } from "@/lib/changelog";

export function ChangelogWorkspace({
  entries,
  canWrite,
}: {
  entries: ChangelogEntryView[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState<ChangelogEntryView | null>(null);
  const published = entries.filter((entry) => entry.isPublished);
  const drafts = entries.filter((entry) => !entry.isPublished);

  return (
    <div className="space-y-6">
      {canWrite ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="heading-3 border-b border-border pb-4">
              {editing ? `Editar ${editing.version}` : "Nota extra (opcional)"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Lo de cada deploy ya entra solo. Esto es por si querés dejar una nota que no vino en el código.
            </p>
            <ChangelogForm
              key={editing?.id ?? "new"}
              initial={editing}
              onCancel={() => setEditing(null)}
            />
          </CardContent>
        </Card>
      ) : null}

      {canWrite && drafts.length > 0 ? (
        <div className="space-y-3">
          <h2 className="heading-3">Borradores</h2>
          {drafts.map((entry) => (
            <ChangelogEntryCard
              key={entry.id}
              entry={entry}
              actions={
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(entry)}>
                    Editar
                  </Button>
                  <form action={deleteChangelog}>
                    <input type="hidden" name="id" value={entry.id} />
                    <ConfirmSubmit confirmMessage="¿Borrar este borrador?">Borrar</ConfirmSubmit>
                  </form>
                </div>
              }
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="heading-3">Historial</h2>
        {canWrite ? (
          <div className="space-y-4">
            {published.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay novedades publicadas.</p>
            ) : (
              published.map((entry) => (
                <ChangelogEntryCard
                  key={entry.id}
                  entry={entry}
                  actions={
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(entry)}>
                        Editar
                      </Button>
                      <form action={deleteChangelog}>
                        <input type="hidden" name="id" value={entry.id} />
                        <ConfirmSubmit confirmMessage="¿Borrar esta novedad del historial?">Borrar</ConfirmSubmit>
                      </form>
                    </div>
                  }
                />
              ))
            )}
          </div>
        ) : (
          <ChangelogTimeline entries={published} />
        )}
      </div>
    </div>
  );
}
