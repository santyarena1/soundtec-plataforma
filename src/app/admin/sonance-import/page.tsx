import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { saveSetting } from "@/server/actions/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SonanceImportPanel } from "./_client";

export const metadata = { title: "Admin · Sincronización Sonance" };

export default async function SonanceImportPage() {
  await requireAdmin();
  const [portalUser, portalPass] = await Promise.all([
    getSetting("sonance.portal_username", ""),
    getSetting("sonance.portal_password", ""),
  ]);
  const hasPortal = !!(portalUser && portalPass);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronización Sonance / IPORT / BLAZE / JAMES"
        description="Conecta el portal my.sonance.com con tus credenciales de dealer y sincronizá todas las marcas en una sola corrida."
      />

      {/* Portal (my.sonance.com) credentials */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="heading-3">Credenciales my.sonance.com</h2>
            {hasPortal ? <Badge tone="success">configuradas</Badge> : <Badge tone="muted">sin configurar</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Usuario y password del portal dealer. Una sola sesión trae todas las marcas (SONANCE, IPORT, BLAZE, JAMES, TRUFIG)
            con SKU + nombre + precio en USD, listo para previsualizar y aplicar.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={saveSetting} className="space-y-1.5">
              <input type="hidden" name="key" value="sonance.portal_username" />
              <Label htmlFor="portal-user">Usuario (email)</Label>
              <Input
                id="portal-user"
                name="value"
                type="email"
                defaultValue={portalUser}
                placeholder="alejandroarena@soundtec.com.ar"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">Guardar</Button>
              </div>
            </form>
            <form action={saveSetting} className="space-y-1.5">
              <input type="hidden" name="key" value="sonance.portal_password" />
              <Label htmlFor="portal-pass">Password</Label>
              <Input
                id="portal-pass"
                name="value"
                type="password"
                defaultValue={portalPass}
                placeholder="••••••••"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">Guardar</Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <SonanceImportPanel hasPortal={hasPortal} />
    </div>
  );
}
