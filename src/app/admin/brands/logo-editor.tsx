"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { removeBrandLogo, saveBrandLogoUrl, uploadBrandLogoFile } from "@/server/actions/brand-logos";

const ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp,image/gif,image/avif,.svg";

/** Logo de la marca: subir archivo (cualquier formato de imagen) o URL de una imagen. */
export function LogoEditor({ brandId, brandName, logoSrc }: { brandId: string; brandName: string; logoSrc: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [url, setUrl] = useState("");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) return setError(r.error);
      setBroken(false);
      setUrl("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-semibold">Logo</p>
      <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-white">
        {logoSrc && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt={brandName} className="max-h-14 max-w-[80%] object-contain" onError={() => setBroken(true)} />
        ) : (
          <span className="text-xs text-muted-foreground">
            {broken ? "El logo cargado no se puede mostrar: subí el archivo o cargá otra URL." : "Sin logo"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
          {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Subir archivo
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              run(() => uploadBrandLogoFile(brandId, fd));
              e.target.value = "";
            }}
          />
        </label>
        {logoSrc ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeBrandLogo(brandId))}>
            Quitar logo
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">PNG, JPG, SVG, WEBP, GIF o AVIF · hasta 1 MB</span>
      </div>

      <div>
        <Label htmlFor={`logo-url-${brandId}`}>O pegá la URL de la imagen</Label>
        <div className="flex gap-2">
          <Input
            id={`logo-url-${brandId}`}
            type="url"
            placeholder="https://…/logo.png"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="button" variant="outline" disabled={pending || !url.trim()} onClick={() => run(() => saveBrandLogoUrl(brandId, url))}>
            Usar URL
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
