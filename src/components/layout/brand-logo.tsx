import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** branding.logo_url (data URL o URL). Vacío → inicial "S". */
  logoUrl: string;
  /** Tamaño del recuadro (clases h-/w-). */
  className?: string;
}

/**
 * Logo de la marca sobre el color primario. El logo cargado en Branding es
 * blanco: sin fondo propio desaparecía sobre las barras claras.
 */
export function BrandLogo({ logoUrl, className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-sm font-bold text-primary-foreground",
        className
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
      ) : (
        "S"
      )}
    </span>
  );
}
