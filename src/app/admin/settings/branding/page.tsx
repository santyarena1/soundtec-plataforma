import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { SettingField, SettingsCard } from "@/components/admin/setting-field";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { uploadBrandLogo } from "@/server/actions/settings";

export const metadata = { title: "Admin · Marca y apariencia" };

const COLOR_KEYS = [
  {
    key: "branding.primary_color",
    label: "Color primario",
    hint: "Navegación, botones principales y encabezados.",
    placeholder: "#1e3553",
  },
  {
    key: "branding.accent_color",
    label: "Color de acento",
    hint: "Enlaces, foco de formularios y estados interactivos.",
    placeholder: "#2563eb",
  },
  {
    key: "branding.success_color",
    label: "Color positivo",
    hint: "Confirmaciones y estados correctos.",
    placeholder: "#0ea5e9",
  },
];

export default async function SettingsBrandingPage() {
  await requirePermission("branding.manage");
  const keys = [...COLOR_KEYS.map((k) => k.key), "branding.logo_url"];
  const rows = await prisma.adminSetting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const logoUrl = map.get("branding.logo_url") || "";

  return (
    <div className="space-y-5">
      <SettingsSectionHeader href="/admin/settings/branding" />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">Logo</h3>
            <p className="muted-text mt-0.5">
              Subí un archivo desde tu PC (PNG, JPG, WEBP o SVG hasta 500 KB) o pegá una URL.
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

          <form action={uploadBrandLogo} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3">
            <div className="min-w-0">
              <Label htmlFor="file">Subir archivo</Label>
              <Input id="file" name="file" type="file" accept="image/*,.svg" required className="mt-1.5" />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Subir logo
            </Button>
          </form>

          <div className="divide-y divide-border/70 border-t border-border/70">
            <SettingField
              settingKey="branding.logo_url"
              label="URL del logo"
              hint="Alternativa a subir el archivo. Se sobrescribe al subir uno nuevo."
              value={logoUrl}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      <SettingsCard
        title="Colores"
        description="Los cambios se reflejan en la próxima compilación del portal."
      >
        {COLOR_KEYS.map((k) => (
          <SettingField
            key={k.key}
            settingKey={k.key}
            label={k.label}
            hint={k.hint}
            value={map.get(k.key) || ""}
            placeholder={k.placeholder}
          />
        ))}
      </SettingsCard>
    </div>
  );
}
