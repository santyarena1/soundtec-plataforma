import { requireAdmin } from "@/lib/auth-helpers";
import { scrapers } from "@/scrapers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScraperRunner } from "./scraper-runner";

export const metadata = { title: "Admin · Scrapers" };

export default async function ScrapersPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Scrapers"
        description="Cada scraper implementa la interfaz Scraper en src/scrapers. Los resultados se cargan como RawImportedProduct y siguen el mismo flujo de aprobación que las importaciones Excel."
      />

      <Card>
        <CardContent className="p-6">
          <p className="muted-text">
            En el MVP sólo se incluye un scraper mock de ejemplo. Para activar uno real:
            <br />
            1. Crear <code>src/scrapers/&lt;slug&gt;.ts</code> implementando <code>Scraper</code>.
            <br />
            2. Registrarlo en <code>src/scrapers/index.ts</code>.
            <br />
            3. (Opcional) Programar un worker de background usando Render o cron para correr <code>searchProducts</code> periódicamente.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {scrapers.map((s) => (
          <Card key={s.slug}>
            <CardContent className="space-y-3 p-6">
              <div className="flex items-center justify-between">
                <CardTitle>{s.label}</CardTitle>
                <Badge tone="muted">{s.slug}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge tone={s.supportsSearch ? "success" : "muted"}>Búsqueda: {s.supportsSearch ? "sí" : "no"}</Badge>
                <Badge tone={s.supportsProductPage ? "success" : "muted"}>Producto: {s.supportsProductPage ? "sí" : "no"}</Badge>
              </div>
              {s.supportsSearch ? <ScraperRunner slug={s.slug} /> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
