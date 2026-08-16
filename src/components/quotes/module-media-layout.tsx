import { parseQuoteModuleLayout, type QuoteModuleLayout } from "@/lib/quote-module-layout";
import { displayImageCaption } from "@/lib/quote-image-caption";

export type ModuleLayoutImage = {
  id: string;
  url: string;
  caption?: string | null;
};

function Figure({ image, className }: { image: ModuleLayoutImage; className?: string }) {
  const caption = displayImageCaption(image.caption);
  return (
    <figure className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={caption || ""} className="w-full bg-neutral-50 object-contain" />
      {caption ? (
        <figcaption className="mt-[1mm] text-center text-[8pt] text-neutral-600">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function ModuleMediaLayout({
  layout,
  images,
  children,
}: {
  layout?: string | null;
  images: ModuleLayoutImage[];
  children: React.ReactNode;
}) {
  const resolved: QuoteModuleLayout = parseQuoteModuleLayout(layout);
  const photos = images.filter((image) => image.url);
  const first = photos[0];
  const pair = photos.slice(0, 2);

  if (!photos.length || resolved === "text_only") {
    return <>{children}</>;
  }

  if (resolved === "image_left" && first) {
    return (
      <div className="flex items-start gap-[4mm]">
        <Figure image={first} className="w-[38%] shrink-0" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  if (resolved === "image_right" && first) {
    return (
      <div className="flex items-start gap-[4mm]">
        <div className="min-w-0 flex-1">{children}</div>
        <Figure image={first} className="w-[38%] shrink-0" />
      </div>
    );
  }

  if (resolved === "image_above" && first) {
    return (
      <div className="space-y-[3mm]">
        <Figure image={first} />
        {children}
      </div>
    );
  }

  if (resolved === "images_row" && pair.length) {
    return (
      <div className="space-y-[3mm]">
        {children}
        <div className="grid grid-cols-2 gap-[4mm]">
          {pair.map((image) => (
            <Figure key={image.id} image={image} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[3mm]">
      {children}
      {first ? <Figure image={first} /> : null}
    </div>
  );
}
