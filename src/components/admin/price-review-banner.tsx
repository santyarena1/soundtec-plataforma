import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";

/**
 * Cartel fijo arriba de Márgenes y Descuentos: los cambios de reglas no se
 * aplican directo, pasan por «Revisión de cambios» con la lista de precios
 * que se mueven. Muestra cuántas revisiones esperan.
 */
export async function PriceReviewBanner({ area }: { area: "MARGIN" | "DISCOUNT" }) {
  const [own, all] = await Promise.all([
    prisma.priceReview.count({ where: { status: "PENDING", area } }).catch(() => 0),
    prisma.priceReview.count({ where: { status: "PENDING" } }).catch(() => 0),
  ]);
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
      <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" />
      <p className="min-w-0 flex-1">
        <b>Los cambios de esta pantalla no cambian precios al guardar.</b> Crear, editar, activar, desactivar o borrar una regla
        calcula qué productos se moverían (precio actual → nuevo) y queda en <b>Revisión de cambios</b> hasta que alguien lo aplique.
        Las reglas por rubro alcanzan a todos sus subrubros; si hay varias, gana la del rubro más específico.
      </p>
      <Link
        href="/admin/price-reviews"
        className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
      >
        {all > 0 ? `${all} pendiente${all === 1 ? "" : "s"} de revisar${own !== all ? ` (${own} de esta pantalla)` : ""}` : "Revisión de cambios"}
      </Link>
    </div>
  );
}
