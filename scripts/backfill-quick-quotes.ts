/**
 * Marca como «rápidas» las cotizaciones que se armaron con la pantalla rápida
 * antes de que existiera Quote.isQuick: sin entrega por fila, sin brief, sin
 * pedido de origen y con todas las filas cargadas a mano.
 *
 *   npx tsx scripts/backfill-quick-quotes.ts          (solo cuenta)
 *   npx tsx scripts/backfill-quick-quotes.ts --apply  (marca)
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  const candidates = await prisma.quote.findMany({
    where: { isQuick: false, showDeliveryColumn: false, sourceRequestId: null, OR: [{ brief: null }, { brief: "" }] },
    select: { id: true, number: true, items: { select: { source: true } } },
  });
  const quick = candidates.filter((q) => q.items.length > 0 && q.items.every((i) => i.source === "MANUAL"));
  console.log(`Rápidas detectadas: ${quick.length} (${quick.map((q) => q.number).join(", ")})`);
  if (!apply || !quick.length) return;
  const r = await prisma.quote.updateMany({ where: { id: { in: quick.map((q) => q.id) } }, data: { isQuick: true } });
  console.log(`Marcadas: ${r.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
