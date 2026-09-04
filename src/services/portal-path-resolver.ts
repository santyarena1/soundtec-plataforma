/**
 * Resolvedor de rutas usadas en la UI de mapping Sonance.
 *
 * Sintaxis soportada:
 *   - "campo"               → detail.campo
 *   - "campo.sub"           → detail.campo.sub
 *   - "arr[].sub"           → detail.arr.map(item => item.sub) (array de valores)
 *   - "arr[]"               → detail.arr (el array completo)
 *   - "attr:Label"          → primer valor de attributeTypes con label "Label"
 *   - "$root"               → todo el detalle V1 (para sourceMetadata)
 */

function getNested(obj: unknown, path: string): unknown {
  if (obj == null) return null;
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[part];
    if (cur === undefined) return null;
  }
  return cur ?? null;
}

export function resolvePath(detail: unknown, path: string): unknown {
  if (!path || detail == null) return null;

  // Whole object
  if (path === "$root" || path === ".") return detail;

  // Attribute shortcut: "attr:Product Category"
  if (path.startsWith("attr:")) {
    const wanted = path.slice(5).trim().toLowerCase();
    const attrs = (detail as { attributeTypes?: Array<Record<string, unknown>> }).attributeTypes ?? [];
    const found = attrs.find((a) => {
      const lbl = String(a.label ?? a.name ?? "").toLowerCase();
      return lbl === wanted;
    });
    if (!found) return null;
    const values = (
      (found.attributeValues as Array<Record<string, unknown>> | undefined) ?? []
    )
      .map((v) => String(v.valueDisplay ?? v.value ?? "").trim())
      .filter((s) => s.length > 0);
    return values.length === 0 ? null : values.length === 1 ? values[0] : values;
  }

  // Array map: "arr[].sub" or "arr[]"
  const arrMatch = path.match(/^([^[\]]+)\[\](?:\.(.+))?$/);
  if (arrMatch) {
    const [, arrPath, subPath] = arrMatch;
    const arr = getNested(detail, arrPath);
    if (!Array.isArray(arr)) return [];
    if (!subPath) return arr;
    return arr
      .map((item) => getNested(item, subPath))
      .filter((v): v is unknown => v != null);
  }

  // Simple nested path
  return getNested(detail, path);
}

export interface PathOption {
  path: string;
  label: string;
  hint?: string;
}

export interface PathGroup {
  group: string;
  paths: PathOption[];
}

/** Catálogo de rutas disponibles agrupadas, para mostrar en el dropdown de la UI. */
export const API_PATHS: PathGroup[] = [
  {
    group: "Identificación",
    paths: [
      { path: "modelNumber", label: "modelNumber (SKU customer-facing, ej. PPX8) ⭐ recomendado para SKU" },
      { path: "name", label: "name (SKU corto, mismo que modelNumber en V1)" },
      { path: "erpNumber", label: "erpNumber (ERP interno Sonance, ej. 93785)" },
      { path: "productNumber", label: "productNumber (solo V2 listing — vacío en V1)" },
      { path: "productTitle", label: "productTitle (solo V2 listing — vacío en V1)" },
      { path: "manufacturerItem", label: "manufacturerItem" },
      { path: "urlSegment", label: "urlSegment (slug)" },
      { path: "id", label: "id (GUID interno Sonance — no recomendado para SKU)" },
    ],
  },
  {
    group: "Precios",
    paths: [
      {
        path: "pricing.unitNetPrice",
        label: "pricing.unitNetPrice (My Price del dealer) ⭐ costo FOB",
      },
      { path: "unitListPrice", label: "unitListPrice (precio de sesión / listing)" },
      {
        path: "basicListPrice",
        label: "basicListPrice (wholesale/list de catálogo — NO es My Price)",
      },
      { path: "basicSalePrice", label: "basicSalePrice (USD promo)" },
      { path: "basicSaleStartDate", label: "basicSaleStartDate (inicio promo)" },
      { path: "basicSaleEndDate", label: "basicSaleEndDate (fin promo)" },
      { path: "unitListPriceDisplay", label: "unitListPriceDisplay (formateado)" },
      { path: "salePriceLabel", label: "salePriceLabel" },
      { path: "currencySymbol", label: "currencySymbol" },
      { path: "properties.cadMsrp", label: "properties.cadMsrp (CAD MSRP)" },
      { path: "properties.cadWholesale", label: "properties.cadWholesale (CAD wholesale)" },
    ],
  },
  {
    group: "Descripciones",
    paths: [
      { path: "shortDescription", label: "shortDescription" },
      { path: "erpDescription", label: "erpDescription" },
      { path: "htmlContent", label: "htmlContent (HTML largo)" },
      { path: "metaDescription", label: "metaDescription" },
      { path: "metaKeywords", label: "metaKeywords" },
      { path: "pageTitle", label: "pageTitle" },
    ],
  },
  {
    group: "Imágenes",
    paths: [
      { path: "largeImagePath", label: "largeImagePath (principal)" },
      { path: "mediumImagePath", label: "mediumImagePath" },
      { path: "smallImagePath", label: "smallImagePath" },
      { path: "altText", label: "altText (alt principal)" },
      { path: "productImages[].largeImagePath", label: "productImages[] · large (todas las URLs)" },
      { path: "productImages[].mediumImagePath", label: "productImages[] · medium" },
      { path: "productImages[]", label: "productImages[] (objetos completos)" },
    ],
  },
  {
    group: "Categorías (desde attributeTypes)",
    paths: [
      { path: "attr:Product Category", label: "Product Category" },
      { path: "attr:Product Sub Category", label: "Product Sub Category" },
      { path: "attr:Product Super Category", label: "Product Super Category" },
      { path: "attr:Type", label: "Type" },
      { path: "attr:Installation Location", label: "Installation Location" },
      { path: "attr:Product Brand", label: "Product Brand" },
    ],
  },
  {
    group: "Specs técnicos (attributeTypes)",
    paths: [
      { path: "attributeTypes", label: "attributeTypes (array completo, 25 specs)" },
      { path: "attr:Frequency Response (+/- 3dB)", label: "Frequency Response (+/- 3dB)" },
      { path: "attr:Frequency Response (+/- 10dB)", label: "Frequency Response (+/- 10dB)" },
      { path: "attr:Impedance", label: "Impedance" },
      { path: "attr:Nominal Impedance", label: "Nominal Impedance" },
      { path: "attr:Power Handling", label: "Power Handling" },
      { path: "attr:Sensitivity", label: "Sensitivity" },
      { path: "attr:Product Dimensions (WxHxD)", label: "Product Dimensions (WxHxD)" },
      { path: "attr:Product Width", label: "Product Width" },
      { path: "attr:Product Height", label: "Product Height" },
      { path: "attr:Product Depth", label: "Product Depth" },
      { path: "attr:Speaker Tweeter", label: "Speaker Tweeter" },
      { path: "attr:Speaker Woofer", label: "Speaker Woofer" },
    ],
  },
  {
    group: "Documentos",
    paths: [
      { path: "documents", label: "documents (array completo: datasheets/manuales/planos)" },
    ],
  },
  {
    group: "Accesorios / relacionados",
    paths: [
      { path: "accessories[].id", label: "accessories[] · id (GUID Sonance) ⭐ RECOMENDADO — funciona con cualquier supplierSku" },
      { path: "accessories[].productNumber", label: "accessories[] · productNumber (model SKU, ej. PPX8)" },
      { path: "accessories[].erpNumber", label: "accessories[] · erpNumber (ID ERP, ej. 93785)" },
      { path: "accessories[].name", label: "accessories[] · name (alternativa V1)" },
      { path: "accessories[]", label: "accessories[] (productos completos)" },
      { path: "crossSells[].id", label: "crossSells[] · id (GUID) ⭐" },
      { path: "crossSells[].productNumber", label: "crossSells[] · productNumber" },
      { path: "alsoPurchasedProducts[].id", label: "alsoPurchased[] · id (GUID) ⭐" },
      { path: "alsoPurchasedProducts[].productNumber", label: "alsoPurchased[] · productNumber" },
    ],
  },
  {
    group: "Marca",
    paths: [
      { path: "__sourceBrand", label: "__sourceBrand (slug top-level del listing — BLAZE / TRUFIG / IPORT / JAMES) ⭐ RECOMENDADO" },
      { path: "brand.name", label: "brand.name (V1 brand — siempre devuelve 'SONANCE' para sub-marcas)" },
      { path: "brand.urlSegment", label: "brand.urlSegment" },
      { path: "brand.logoSmallImagePath", label: "brand.logoSmallImagePath" },
      { path: "brand.id", label: "brand.id (GUID)" },
      { path: "attr:Product Brand", label: "attr:Product Brand (alternativa)" },
    ],
  },
  {
    group: "URLs portal",
    paths: [
      { path: "canonicalUrl", label: "canonicalUrl" },
      { path: "productDetailUrl", label: "productDetailUrl (path relativo, ej. /Product/93785)" },
      { path: "displayUrl", label: "displayUrl" },
    ],
  },
  {
    group: "Badges / etiquetas",
    paths: [
      { path: "badges", label: "badges (array completo de etiquetas)" },
    ],
  },
  {
    group: "Status / flags",
    paths: [
      { path: "isActive", label: "isActive" },
      { path: "isDiscontinued", label: "isDiscontinued" },
      { path: "cantBuy", label: "cantBuy" },
      { path: "canShowPrice", label: "canShowPrice" },
      { path: "quoteRequired", label: "quoteRequired" },
      { path: "canBackOrder", label: "canBackOrder" },
      { path: "canConfigure", label: "canConfigure" },
      { path: "isHazardousGood", label: "isHazardousGood" },
      { path: "hasMsds", label: "hasMsds" },
    ],
  },
  {
    group: "Stock / availability",
    paths: [
      { path: "qtyOnHand", label: "qtyOnHand" },
      { path: "requiresRealTimeInventory", label: "requiresRealTimeInventory" },
      { path: "availability.message", label: "availability.message" },
      { path: "availability.messageType", label: "availability.messageType" },
      { path: "minimumOrderQty", label: "minimumOrderQty" },
      { path: "multipleSaleQty", label: "multipleSaleQty" },
    ],
  },
  {
    group: "Shipping / físico",
    paths: [
      { path: "shippingHeight", label: "shippingHeight" },
      { path: "shippingLength", label: "shippingLength" },
      { path: "shippingWidth", label: "shippingWidth" },
      { path: "shippingWeight", label: "shippingWeight (lbs — se convierte a kg automáticamente)" },
      { path: "attr:Product Weight", label: "Product Weight (con kg en paréntesis) ⭐ recomendado para peso" },
      { path: "attr:Shipping Weight", label: "Shipping Weight (con kg en paréntesis)" },
      { path: "qtyPerShippingPackage", label: "qtyPerShippingPackage" },
    ],
  },
  {
    group: "UoM",
    paths: [
      { path: "customerUnitOfMeasure", label: "customerUnitOfMeasure" },
      { path: "selectedUnitOfMeasure", label: "selectedUnitOfMeasure" },
      { path: "unitOfMeasure", label: "unitOfMeasure" },
      { path: "unitOfMeasureDescription", label: "unitOfMeasureDescription" },
    ],
  },
  {
    group: "Raw completo",
    paths: [
      { path: "$root", label: "Todo el detalle V1 completo (JSON raw)" },
    ],
  },
];

/** Aplica un mapping {dbField: apiPath} sobre un detail V1, resolviendo cada path. */
export function applyMapping(
  detail: unknown,
  mapping: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [dbField, path] of Object.entries(mapping)) {
    if (!path) continue;
    const value = resolvePath(detail, path);
    if (value !== null && value !== undefined) {
      result[dbField] = value;
    }
  }
  return result;
}
