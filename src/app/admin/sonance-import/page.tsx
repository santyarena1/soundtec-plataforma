import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { saveSetting } from "@/server/actions/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SonanceImportPanel } from "./_client";

export const metadata = { title: "Admin · Importación Sonance / IPORT / BLAZE" };

export default async function SonanceImportPage() {
  await requireAdmin();
  const [url1, url2] = await Promise.all([
    getSetting("sonance.box_url_1", ""),
    getSetting("sonance.box_url_2", ""),
  ]);
  const hasLinks = !!(url1 || url2);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronización Sonance / IPORT / BLAZE"
        description="Configurá los links de Box y sincronizá automáticamente, o subí el Excel manualmente. Preview siempre antes de aplicar."
      />

      {/* Box links config */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="heading-3">Links de Box (descarga automática)</h2>
            {hasLinks ? (
              <Badge tone="success">configurados</Badge>
            ) : (
              <Badge tone="muted">sin configurar</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Pegá los links compartidos de Box tal como están. El sistema descarga los archivos directamente
            replicando el flujo del browser (page → request token → access token → download).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={saveSetting} className="space-y-1.5">
              <input type="hidden" name="key" value="sonance.box_url_1" />
              <Label htmlFor="box-url-1">Link 1 — Sonance + IPORT</Label>
              <Input
                id="box-url-1"
                name="value"
                type="url"
                defaultValue={url1}
                placeholder="https://danainnovations.app.box.com/s/.../file/..."
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">Guardar</Button>
              </div>
            </form>
            <form action={saveSetting} className="space-y-1.5">
              <input type="hidden" name="key" value="sonance.box_url_2" />
              <Label htmlFor="box-url-2">Link 2 — BLAZE by SONANCE</Label>
              <Input
                id="box-url-2"
                name="value"
                type="url"
                defaultValue={url2}
                placeholder="https://danainnovations.app.box.com/s/.../file/..."
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">Guardar</Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <SonanceImportPanel hasLinks={hasLinks} />
    </div>
  );
}
