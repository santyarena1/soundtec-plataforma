import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { TutorialReader } from "./tutorial-reader";

export const metadata = { title: "Admin · Ayuda" };

export default function AdminHelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cómo funciona la plataforma"
        description="Versión corta o tutorial completo: flujo, cada campo, qué se puede editar, dónde se configura, y cómo avisar al desarrollador si algo no anda."
      />
      <Suspense fallback={<p className="muted-text">Cargando tutorial…</p>}>
        <TutorialReader />
      </Suspense>
    </div>
  );
}
