import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveSetting, uploadBrandLogo } from "@/server/actions/settings";

export const metadata = { title: "Admin · Branding" };

const keys = [
  { key: "branding.primary_color", label: "Color primario (navy)", placeholder: "#1e3553" },
  { key: "branding.accent_color", label: "Color de acento", placeholder: "#2563eb" },
  { key: "branding.success_color", label: "Color positivo", placeholder: "#0ea5e9" },
  { key: "branding.logo_url", label: "URL del logo", placeholder: "https://..." },
];

export default async function AdminBrandingPage() {
  await requireAdmin();
  const rows = await prisma.adminSetting.findMany({ where: { key: { in: keys.map((k) => k.key) } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const logoUrl = map.get("branding.logo_url") || "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branding"
        description="Logo y colores principales. Para que los colores se reflejen en la UI hay que recompilar (los valores se exponen via clases utilitarias)."
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="heading-3">Logo por archivo</h2>
            <p className="text-sm text-muted-foreground">
              También podés subir el logo directamente desde tu PC (PNG/JPG/WEBP/SVG, hasta 5MB).
            </p>
          </div>

          {logoUrl ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/40 p-3">
              <div className="h-12 w-12 overflow-hidden rounded bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo actual" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Logo actual</p>
                <p className="truncate text-xs text-muted-foreground">{logoUrl}</p>
              </div>
            </div>
          ) : null}

          <form action={uploadBrandLogo} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="file">Archivo de logo</Label>
              <Input id="file" name="file" type="file" accept="image/*,.svg" required />
            </div>
            <Button type="submit">Subir logo</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {keys.map((k) => (
          <Card key={k.key}>
            <CardContent className="p-5">
              <form action={saveSetting} className="space-y-2">
                <input type="hidden" name="key" value={k.key} />
                <Label htmlFor={k.key}>{k.label}</Label>
                <Input id={k.key} name="value" defaultValue={map.get(k.key) || ""} placeholder={k.placeholder} />
                <div className="flex justify-end">
                  <Button type="submit" size="sm">Guardar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
