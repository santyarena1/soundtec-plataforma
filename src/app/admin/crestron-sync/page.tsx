import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { saveSetting } from "@/server/actions/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CrestronSyncPanel } from "./_client";

export const metadata = { title: "Admin · Sincronización Crestron" };

function mask(v: string) {
  if (!v) return "";
  if (v.length <= 6) return "•".repeat(v.length);
  return `${v.slice(0, 3)}${"•".repeat(v.length - 6)}${v.slice(-3)}`;
}

export default async function CrestronSyncPage() {
  await requireAdmin();
  const [username, password] = await Promise.all([
    getSetting("crestron.username", ""),
    getSetting("crestron.password", ""),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronización lista Crestron"
        description="Precios y stock desde Xtrabone. Las fichas (foto, texto, specs) se completan aparte, desde el catálogo público de Crestron."
      />

      {/* Credentials */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="heading-3">Credenciales de acceso</h2>
            {username && password ? (
              <Badge tone="success">configuradas</Badge>
            ) : (
              <Badge tone="warning">sin configurar</Badge>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={saveSetting} className="space-y-1.5">
              <input type="hidden" name="key" value="crestron.username" />
              <Label htmlFor="crestron-user">Usuario</Label>
              <Input
                id="crestron-user"
                name="value"
                type="text"
                defaultValue={username}
                placeholder="comex@soundtec.com.ar"
                autoComplete="off"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">Guardar usuario</Button>
              </div>
            </form>

            <form action={saveSetting} className="space-y-1.5">
              <input type="hidden" name="key" value="crestron.password" />
              <Label htmlFor="crestron-pass">Contraseña</Label>
              <Input
                id="crestron-pass"
                name="value"
                type="password"
                defaultValue={password}
                placeholder={password ? mask(password) : "••••••••"}
                autoComplete="new-password"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">Guardar contraseña</Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <CrestronSyncPanel hasCredentials={!!(username && password)} />
    </div>
  );
}
