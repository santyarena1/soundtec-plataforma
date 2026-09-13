import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProfilesPanel } from "@/components/expo/profiles-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Perfiles del asistente" };

export default async function Page() {
  await requireAdmin();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Perfiles de producto"
        description="Clasificación técnica de cada producto, construida una sola vez a partir de su ficha. Es lo que le permite al asistente responder sobre todo el catálogo en vez de sobre un puñado de productos."
        actions={
          <Link href="/admin/assistant" className="text-sm text-primary hover:underline">
            Volver al asistente
          </Link>
        }
      />

      <ProfilesPanel />

      <Card>
        <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Qué hace este proceso</p>
          <p>
            Lee la ficha completa de cada producto (descripción, características, especificaciones, el
            HTML del fabricante y el dato crudo del portal) y guarda una clasificación estable: si sirve
            para exterior y con qué frase de la ficha se justifica, el grado de protección, el tipo de
            montaje, la línea de audio, la potencia, con qué ecosistemas es compatible y para qué tipo de
            instalación se usa. También guarda un resumen en español y un vector para la búsqueda por
            significado.
          </p>
          <p>
            Cada producto se procesa una sola vez. Si su ficha cambia, se vuelve a procesar solo ese
            producto. El grado de protección, la línea de audio y la potencia se leen directamente de la
            ficha con reglas, no los decide el modelo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
