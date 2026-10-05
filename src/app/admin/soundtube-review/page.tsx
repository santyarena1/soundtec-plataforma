import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buildReviewView, loadReviewState } from "@/server/soundtube/review";
import { StartReviewForm } from "./_start-form";
import { ReviewPanel } from "./_review";

export const metadata = { title: "Admin · Revisión SoundTube" };
export const dynamic = "force-dynamic";
// Aplicar la revisión actualiza cientos de productos.
export const maxDuration = 300;

const formatArt = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

/**
 * Módulo temporal: resolver desde el sistema todo lo que falta para cargar
 * la lista de SoundTube. Cuando se aplica y se cierra, desaparece del menú.
 */
export default async function SoundTubeReviewPage() {
  await requireAdmin();
  const state = await loadReviewState();

  if (!state?.active) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Revisión SoundTube"
          description="Subí la lista de SoundTube y resolvé desde acá lo que no coincide con el sistema antes de aplicarla."
        />
        {state?.appliedAt ? (
          <p className="text-sm text-muted-foreground">
            Última revisión: <span className="font-medium text-foreground">{state.fileName}</span>, aplicada el{" "}
            {formatArt(state.appliedAt)}
            {state.applyResult
              ? ` (${state.applyResult.updated} actualizados, ${state.applyResult.created} creados, ${state.applyResult.deactivated} desactivados).`
              : "."}
          </p>
        ) : null}
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm">Empezar una revisión nueva con un Excel de SoundTube:</p>
            <StartReviewForm />
            <p className="text-xs text-muted-foreground">
              Para una lista que ya está limpia podés usar directamente{" "}
              <Link href="/admin/sync/soundtube-prices" className="underline">Lista de precios SoundTube</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const view = await buildReviewView(state);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisión SoundTube"
        description="Módulo temporal: resolvé cada problema de la lista. Las decisiones se guardan al instante, así se puede trabajar de a poco o entre varias personas. Cuando no falta nada, se aplica todo junto."
      />
      <ReviewPanel
        fileName={state.fileName}
        uploadedAt={formatArt(state.uploadedAt)}
        rowsCount={state.rows.length}
        warnings={state.warnings}
        invalid={state.invalid}
        matchedCount={view.matchedCount}
        pending={view.pending}
        pairs={view.pairs}
        newProducts={view.newProducts}
        classification={view.classification}
        missing={view.missing}
        brands={[...view.brands]}
        applyTaxonomy={state.applyTaxonomy}
        appliedAt={state.appliedAt ? formatArt(state.appliedAt) : null}
        applyResult={state.applyResult ?? null}
      />
    </div>
  );
}
