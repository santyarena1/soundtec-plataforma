import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sonance-import/db-columns
 *
 * Devuelve la lista de columnas disponibles en la tabla Product
 * (más relaciones derivadas que típicamente se llenan en una sync),
 * con tipo, sample value y cobertura (% de productos que tienen el campo seteado).
 *
 * Sirve para que el usuario vea TODO lo que se puede llenar en la BD y
 * decida cómo mapear los campos de la API a esos slots.
 */

type ColumnInfo = {
  field: string;
  label: string;
  type: string;
  description: string;
  coveragePercent?: number;
  sample?: string;
};

const COLUMNS: Omit<ColumnInfo, "coveragePercent" | "sample">[] = [
  // Identificación
  { field: "internalSku", label: "SKU interno Soundtec", type: "string", description: "Único en la tabla — el que usa internamente Soundtec" },
  { field: "supplierSku", label: "SKU del proveedor", type: "string", description: "El SKU que viene del proveedor" },
  { field: "normalizedName", label: "Nombre (display)", type: "string", description: "Lo que se muestra públicamente, idealmente en español" },
  { field: "originalName", label: "Nombre original (inglés)", type: "string", description: "Nombre crudo del proveedor en inglés" },

  // Relaciones
  { field: "brandId", label: "Marca", type: "Marca (FK)", description: "Relación con tabla Marcas — busca por nombre o crea" },
  { field: "distributorId", label: "Distribuidor", type: "Distribuidor (FK)", description: "Distribuidor / proveedor (FK)" },
  { field: "categoryId", label: "Categoría", type: "Categoría (FK)", description: "Relación con tabla Categorías — busca por nombre o crea" },
  { field: "familyId", label: "Familia", type: "Familia (FK)", description: "Relación con tabla Familias — busca por nombre o crea" },

  // Descripciones
  { field: "shortDescription", label: "Descripción corta", type: "texto", description: "1-2 líneas resumen del producto" },
  { field: "longDescription", label: "Descripción larga (texto plano)", type: "texto", description: "Descripción extensa sin formato" },
  { field: "htmlContent", label: "Descripción HTML enriquecida", type: "HTML", description: "HTML largo con formato, imágenes y links" },

  // Texto libre clasificación
  { field: "familia", label: "Rubro (texto libre)", type: "texto", description: "Campo de texto libre (no FK)" },
  { field: "tipo", label: "Subrubro (texto libre)", type: "texto", description: "Campo de texto libre (no FK)" },

  // Precio + moneda
  { field: "baseCostUsd", label: "Costo base USD", type: "decimal", description: "Precio base en dólares (numérico, 4 decimales)" },
  { field: "currency", label: "Moneda", type: "texto", description: "Default USD" },

  // Posición arancelaria
  { field: "tariffPosition", label: "Posición NCM", type: "texto", description: "Código arancelario NCM" },
  { field: "tariffDutyPercent", label: "Derecho de importación (DIE) %", type: "decimal", description: "Alícuota DIE de la NCM" },
  { field: "aecPercent", label: "AEC %", type: "decimal", description: "Arancel Externo Común" },
  { field: "tePercent", label: "Tasa Estadística (TE) %", type: "decimal", description: "Tasa Estadística" },

  // Logística
  { field: "coo", label: "País de origen", type: "texto", description: "Country Of Origin" },
  { field: "weight", label: "Peso (kg)", type: "decimal", description: "Peso del producto en kilos" },
  { field: "volume", label: "Volumen (m³)", type: "decimal", description: "Volumen en metros cúbicos" },

  // Stock + descuentos
  { field: "stockStatus", label: "Estado de stock", type: "enum", description: "En stock / Poco stock / Sin stock / A pedido / Desconocido" },
  { field: "stockQuantity", label: "Cantidad en stock", type: "entero", description: "Unidades disponibles" },
  { field: "discountPercent", label: "Descuento %", type: "decimal", description: "Descuento aplicado al precio" },

  // Coeficientes nacionalización
  { field: "coefNac", label: "Coef. nacionalización", type: "decimal", description: "Multiplicador FOB → Costo nacionalizado" },
  { field: "coefVta", label: "Coef. venta nacional", type: "decimal", description: "Multiplicador Costo NAC → Precio venta NAC" },
  { field: "ivaPercent", label: "IVA %", type: "decimal", description: "Default 21" },
  { field: "impIntPercent", label: "Impuesto interno %", type: "decimal", description: "Si aplica" },
  { field: "coefVtaFob", label: "Coef. venta FOB", type: "decimal", description: "Multiplicador costo FOB → Precio venta FOB" },

  // Flags
  { field: "isCustomizable", label: "Customizable / configurable", type: "booleano", description: "Producto con opciones" },
  { field: "isCrestronHomeCompatible", label: "Compatible con Crestron Home", type: "booleano", description: "Integra con Crestron Home" },
  { field: "kind", label: "Tipo (principal / accesorio)", type: "enum", description: "PRINCIPAL o ACCESORIO" },
  { field: "accessoryRequiredWithPrimary", label: "Accesorio obligatorio con principal", type: "booleano", description: "Si requiere venderse junto a su principal" },
  { field: "isActive", label: "Activo en catálogo", type: "booleano", description: "Visible en el catálogo público" },

  // Enriquecimiento desde portales
  { field: "specifications", label: "Especificaciones técnicas (JSON)", type: "JSON", description: "Array de specs (label, value, etc.)" },
  { field: "documents", label: "Documentos / datasheets (JSON)", type: "JSON", description: "PDFs, manuales, planos" },
  { field: "sourceMetadata", label: "Datos crudos del portal (JSON)", type: "JSON", description: "Detalle V1 completo de la API — para mapeo posterior" },
  { field: "enrichedAt", label: "Última fecha de enriquecimiento", type: "Fecha+hora", description: "Cuándo se enriqueció con datos completos" },
  { field: "translatedAt", label: "Última fecha de traducción al ES", type: "Fecha+hora", description: "Cuándo se tradujeron campos al español" },

  // Identificación alternativa
  { field: "modelNumber", label: "Número de modelo", type: "texto", description: "Código de modelo del fabricante (ej. AMP-X300)" },
  { field: "manufacturerItem", label: "SKU del fabricante", type: "texto", description: "SKU del fabricante si difiere del supplierSku" },
  { field: "productLine", label: "Línea de producto", type: "texto", description: "Línea / serie a la que pertenece el producto" },

  // URLs / SEO
  { field: "vendorProductUrl", label: "URL del proveedor", type: "URL", description: "Link a la página del producto en el portal del proveedor" },
  { field: "urlSlug", label: "Slug del proveedor", type: "texto", description: "Identificador de URL usado por el proveedor (ej. 'sa68')" },
  { field: "metaTitle", label: "Meta title (SEO)", type: "texto", description: "Título para SEO/Open Graph" },
  { field: "metaDescription", label: "Meta description (SEO)", type: "texto", description: "Descripción para buscadores" },
  { field: "metaKeywords", label: "Meta keywords (SEO)", type: "texto", description: "Palabras clave" },
  { field: "videoUrl", label: "Video del producto", type: "URL", description: "Link a video demo / institucional" },

  // Sale info
  { field: "salePriceUsd", label: "Precio en promoción USD", type: "decimal", description: "Precio cuando está en oferta" },
  { field: "salePriceStartsAt", label: "Promo desde", type: "Fecha+hora", description: "Inicio de vigencia de la promo" },
  { field: "salePriceEndsAt", label: "Promo hasta", type: "Fecha+hora", description: "Fin de vigencia de la promo" },
  { field: "salePriceLabel", label: "Etiqueta de promo", type: "texto", description: "Ej. 'ON SALE', '-20%'" },

  // Availability
  { field: "availabilityMessage", label: "Mensaje de disponibilidad", type: "texto", description: "Texto que muestra el proveedor (ej. 'In stock', 'On order')" },
  { field: "availabilityType", label: "Tipo de disponibilidad", type: "texto", description: "INSTOCK / BACKORDER / OUTOFSTOCK / etc." },

  // Dimensiones físicas
  { field: "widthCm", label: "Ancho (cm)", type: "decimal", description: "Ancho del producto en centímetros" },
  { field: "heightCm", label: "Alto (cm)", type: "decimal", description: "Alto del producto en centímetros" },
  { field: "depthCm", label: "Profundidad (cm)", type: "decimal", description: "Profundidad del producto en centímetros" },

  // Flags
  { field: "requiresQuote", label: "Requiere cotización", type: "booleano", description: "Si el producto solo se vende por cotización" },

  // JSON badges
  { field: "badges", label: "Badges / etiquetas (JSON)", type: "JSON", description: "Array de etiquetas como NEW / ON SALE / FEATURED" },

  // Relaciones (no son campos de Product directos — crean filas en tablas relacionadas)
  { field: "(rel) images", label: "Imágenes (relación)", type: "tabla relacionada", description: "Crea filas en ProductImage (URL + alt + isPrimary)" },
  { field: "(rel) accessories", label: "Accesorios compatibles (relación)", type: "tabla relacionada", description: "Productos compatibles / requeridos. Marca el padre como configurable." },
  { field: "(rel) crossSells", label: "Cross-sells / alternativas (relación)", type: "tabla relacionada", description: "Productos alternativos o complementarios sugeridos." },
  { field: "(rel) alsoPurchased", label: "También compraron (relación)", type: "tabla relacionada", description: "Otros productos que compraron clientes — upsell." },
];

export async function GET() {
  try {
    await requireAdmin();

    const totalCount = await prisma.product.count();

    // Cálculo de cobertura sólo para algunos campos clave (los más relevantes)
    const coverage = totalCount > 0
      ? await prisma.product.groupBy({
          by: ["currency"],
          _count: { _all: true },
        }).then(() => ({})).catch(() => ({}))
      : {};

    // Sólo los campos más interesantes para coverage real
    const interestingFields = [
      "supplierSku",
      "internalSku",
      "brandId",
      "categoryId",
      "familyId",
      "shortDescription",
      "longDescription",
      "htmlContent",
      "familia",
      "tipo",
      "specifications",
      "documents",
      "sourceMetadata",
      "weight",
      "coo",
    ] as const;

    const coverageMap: Record<string, number> = {};
    if (totalCount > 0) {
      const checks = await Promise.all(
        interestingFields.map((f) =>
          prisma.product.count({ where: { [f]: { not: null } } as any })
        )
      );
      interestingFields.forEach((f, i) => {
        coverageMap[f] = Math.round((checks[i] / totalCount) * 100);
      });
    }

    const columns: ColumnInfo[] = COLUMNS.map((c) => ({
      ...c,
      coveragePercent: coverageMap[c.field],
    }));

    return NextResponse.json({
      ok: true,
      totalProducts: totalCount,
      columns,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
