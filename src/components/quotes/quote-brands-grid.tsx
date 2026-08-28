import type { QuoteBrandLogoView } from "@/lib/quote-brands";

export function QuoteBrandsGrid({
  logos,
  className = "",
}: {
  logos: QuoteBrandLogoView[];
  className?: string;
}) {
  const visible = logos.filter((logo) => logo.visible && logo.url.trim());
  if (visible.length === 0) return null;

  return (
    <div
      className={`grid grid-cols-3 gap-[4mm] sm:grid-cols-4 md:grid-cols-5 ${className}`}
      aria-label="Marcas representadas"
    >
      {visible.map((logo) => (
        <figure key={logo.id} className="flex flex-col items-center justify-center gap-[1.5mm]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.url}
            alt={logo.label}
            className="h-[14mm] max-w-full object-contain"
            loading="lazy"
          />
          <figcaption className="text-center text-[7pt] leading-tight text-neutral-600">{logo.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
