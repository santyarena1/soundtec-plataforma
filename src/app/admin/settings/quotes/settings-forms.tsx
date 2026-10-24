"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { LogoEditor } from "@/app/admin/brands/logo-editor";
import { saveQuoteSettingsBatch, uploadQuoteIdentityImage, resetQuoteIdentityImage } from "@/server/actions/quote-settings";

/** Tarjeta de configuración con un solo «Guardar» para todos sus campos (inputs `setting:<clave>`). */
export function SettingsBatchForm({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  return (
    <form
      className="rounded-xl border border-border bg-card p-5"
      onChange={() => {
        setDirty(true);
        setMessage(null);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await saveQuoteSettingsBatch(data);
          if (!result.ok) return setMessage({ ok: false, text: result.error });
          setDirty(false);
          setMessage({ ok: true, text: "Guardado." });
          router.refresh();
        });
      }}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-3">
        {message ? <span className={`text-xs ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</span> : dirty ? <span className="text-xs text-warning">Cambios sin guardar</span> : null}
        <Button type="submit" size="sm" disabled={pending || !dirty}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </form>
  );
}

/** Imagen de identidad del documento: vista previa, subir archivo o volver a la original. */
export function IdentityImageField({ settingKey, label, hint, currentUrl, fallbackUrl, isCustom }: { settingKey: string; label: string; hint: string; currentUrl: string; fallbackUrl: string; isCustom: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) return setError(result.error ?? "No se pudo guardar.");
      router.refresh();
    });
  return (
    <figure className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={currentUrl || fallbackUrl} alt={label} className="max-h-full max-w-full object-contain" />
      </div>
      <figcaption className="text-sm font-medium">{label}</figcaption>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Subir imagen
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            disabled={pending}
            aria-label={`Subir ${label}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              run(() => uploadQuoteIdentityImage(settingKey, data));
              event.target.value = "";
            }}
          />
        </label>
        {isCustom ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resetQuoteIdentityImage(settingKey))}>
            Volver a la original
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </figure>
  );
}

/** Logo de una marca (el mismo del catálogo): se abre el editor sin salir de la configuración. */
export function BrandLogoTile({ brand }: { brand: { id: string; name: string; logoSrc: string | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-full w-full flex-col items-center gap-1 rounded-lg border border-border p-2 text-center transition-colors hover:border-primary/40 hover:bg-secondary/40"
        title={`Cambiar el logo de ${brand.name}`}
      >
        <span className="flex h-10 w-full items-center justify-center rounded bg-white">
          {brand.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoSrc} alt={brand.name} className="max-h-8 max-w-[90%] object-contain" loading="lazy" />
          ) : (
            <span className="text-[11px] font-medium text-warning">Sin logo</span>
          )}
        </span>
        <span className="line-clamp-1 text-xs">{brand.name}</span>
      </button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} title={`Logo de ${brand.name}`} description="Es el logo del catálogo: se usa también en las cotizaciones.">
          <LogoEditor brandId={brand.id} brandName={brand.name} logoSrc={brand.logoSrc} />
        </Modal>
      ) : null}
    </>
  );
}
