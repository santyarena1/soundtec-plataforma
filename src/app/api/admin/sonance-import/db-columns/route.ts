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
  type: string;
  description: string;
  coveragePercent?: number;
  sample?: string;
};

const COLUMNS: Omit<ColumnInfo, "coveragePercent" | "sample">[] = [
  // Identificación
  { field: "internalSku", type: "string", description: "SKU interno Soundtec (único)" },
  { field: "supplierSku", type: "string", description: "SKU del proveedor (Sonance: productNumber)" },
  { field: "normalizedName", type: "string", description: "Nombre que se muestra (preferiblemente en ES)" },
  { field: "originalName", type: "string", description: "Nombre original del proveedor (EN)" },

  // Relaciones
  { field: "brandId", type: "FK Brand", description: "Marca del producto (SONANCE, IPORT, BLAZE, JAMES…)" },
  { field: "distributorId", type: "FK Distributor", description: "Distribuidor (si aplica)" },
  { field: "categoryId", type: "FK Category", description: "Categoría (FK upsert por nombre)" },
  { field: "familyId", type: "FK ProductFamily", description: "Familia (FK upsert por nombre)" },

  // Descripciones
  { field: "shortDescription", type: "string", description: "Descripción corta (1-2 líneas)" },
  { field: "longDescription", type: "string", description: "Descripción larga (texto plano)" },
  { field: "htmlContent", type: "string", description: "HTML enriquecido (descripción detallada)" },

  // Texto libre clasificación
  { field: "familia", type: "string", description: "Rubro (campo libre)" },
  { field: "tipo", type: "string", description: "Subrubro (campo libre)" },

  // Precio + moneda
  { field: "baseCostUsd", type: "decimal(14,4)", description: "Costo base en USD (Sonance: unitListPrice)" },
  { field: "currency", type: "string", description: "Moneda (default USD)" },

  // Posición arancelaria
  { field: "tariffPosition", type: "string", description: "Posición NCM" },
  { field: "tariffDutyPercent", type: "decimal", description: "DIE %" },
  { field: "aecPercent", type: "decimal", description: "AEC %" },
  { field: "tePercent", type: "decimal", description: "TE %" },

  // Logística
  { field: "coo", type: "string", description: "País de origen (Country Of Origin)" },
  { field: "weight", type: "decimal", description: "Peso en kg" },
  { field: "volume", type: "decimal", description: "Volumen en m³" },

  // Stock + descuentos
  { field: "stockStatus", type: "enum", description: "IN_STOCK | LOW_STOCK | OUT_OF_STOCK | ON_REQUEST | UNKNOWN" },
  { field: "stockQuantity", type: "int", description: "Cantidad en stock" },
  { field: "discountPercent", type: "decimal", description: "Descuento %" },

  // Coeficientes nacionalización
  { field: "coefNac", type: "decimal", description: "Coef. nacionalización" },
  { field: "coefVta", type: "decimal", description: "Coef. venta nacional" },
  { field: "ivaPercent", type: "decimal", description: "IVA % (default 21)" },
  { field: "impIntPercent", type: "decimal", description: "Impuesto interno %" },
  { field: "coefVtaFob", type: "decimal", description: "Coef. venta FOB" },

  // Flags
  { field: "isCustomizable", type: "boolean", description: "Producto custom/configurable" },
  { field: "isCrestronHomeCompatible", type: "boolean", description: "Compatible Crestron Home" },
  { field: "kind", type: "enum", description: "PRINCIPAL | ACCESORIO" },
  { field: "accessoryRequiredWithPrimary", type: "boolean", description: "Accesorio obligatorio con principal" },
  { field: "isActive", type: "boolean", description: "Visible en el catálogo público" },

  // Enriquecimiento desde portales
  { field: "specifications", type: "Json", description: "Specs técnicos (array de {label, value, etc.})" },
  { field: "documents", type: "Json", description: "Documentos (datasheets, manuales, planos)" },
  { field: "sourceMetadata", type: "Json", description: "Raw V1 detail completo del portal (para mapping posterior)" },
  { field: "enrichedAt", type: "DateTime", description: "Última vez que se enriqueció con datos completos" },
  { field: "translatedAt", type: "DateTime", description: "Última vez que se tradujeron campos al ES" },

  // Relaciones de imagen/accesorios (no son campos de Product directos)
  { field: "(rel) images", type: "ProductImage[]", description: "Imágenes asociadas (URL + alt + isPrimary)" },
  { field: "(rel) accessories", type: "AccessoryRelation[]", description: "Productos relacionados como accesorios" },
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
