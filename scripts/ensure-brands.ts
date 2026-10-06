/**
 * Marcas oficiales que tienen que existir aunque todavía no tengan productos
 * (se muestran en el catálogo con «Consultá disponibilidad»). Idempotente:
 * corre en cada build y solo crea lo que falta.
 */
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/utils";

// Crestron Home: ficha para cambiar su logo u ocultarla; sus productos son los de Crestron compatibles.
const OFFICIAL_BRANDS = ["FlatPanel Audio", "Dante", "BrightSign", "Bluesound Professional", "Crestron Home"];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("marcas: sin DATABASE_URL, se omite");
    return;
  }
  for (const name of OFFICIAL_BRANDS) {
    const slug = slugify(name);
    const existing = await prisma.brand.findFirst({
      where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] },
      select: { id: true },
    });
    if (!existing) {
      await prisma.brand.create({ data: { name, slug } });
      console.log(`marcas: creada ${name}`);
    }
  }
  // La marca de ropa no es de equipos: sin productos activos no va en el catálogo.
  const apparel = await prisma.brand.updateMany({
    where: { name: { equals: "APPAREL", mode: "insensitive" }, hiddenFromCatalog: false, products: { none: { isActive: true } } },
    data: { hiddenFromCatalog: true },
  });
  if (apparel.count) console.log("marcas: APPAREL oculta del catálogo (sin productos)");
}

main()
  .catch((err) => {
    console.warn("marcas: no se pudieron asegurar (el build sigue)", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
