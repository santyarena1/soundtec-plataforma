import Link from "next/link";
import { SIN_RUBRO_HREF, uncategorizedNewNotice } from "@/lib/new-product-rubro";

/** Aviso «N productos nuevos quedaron en Sin categorizar» con el link a la bandeja. No muestra nada si son 0. */
export function UncategorizedNewNotice({ count, className = "" }: { count: number | null | undefined; className?: string }) {
  const text = uncategorizedNewNotice(count ?? 0);
  if (!text) return null;
  return (
    <p className={`rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground ${className}`}>
      {text}{" "}
      <Link href={SIN_RUBRO_HREF} className="font-medium text-accent hover:underline">
        Ir a Sin rubro
      </Link>
    </p>
  );
}
