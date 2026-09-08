# Enriquecimiento de productos Crestron desde crestron.com

Conector `crestron-web` (fuente `CRESTRON_WEB`) en `src/services/sync/connectors/crestron-web.ts`.
Corre sobre la misma capa de sync que Xtrabone y Sonance (`/admin/sync`, preview + apply, lotes, rollback, cron).

## Regla principal

- **Precio y stock vienen SOLO de Xtrabone** (conector `crestron`). Este conector nunca escribe `baseCostUsd`, `stockStatus` ni `stockQuantity`.
- No pisa el nombre del producto (`preserveName`). Sí actualiza `originalName` con el modelo oficial.
- Todo lo parseado se guarda completo en `Product.sourceMetadata.crestronCom` (los datos de Xtrabone quedan intactos en el resto del objeto).

## Cómo cruza con Xtrabone

`Product.internalSku` = **Material Number** de Crestron (ej. `6511816`). `crestron.com/model/{materialNumber}` redirige a la ficha oficial.
Fallback: búsqueda pública `/handlers/search_v2.ashx?q={modelo}&quicksearch=true` con match exacto por título.

## Endpoints que usa (públicos, sin login)

| Qué | Endpoint |
|---|---|
| Ficha | `GET /model/{materialNumber}` → 301 → `/Products/Catalog/.../{MODEL}` |
| Búsqueda / metadata | `GET /handlers/search_v2.ashx?q=&quicksearch=true` (JSON: url, thumbnail, discontinuedproduct, datepublished) |
| Documentos | `GET /Handlers/ResourceHandler.ashx?dID={documentId}` (`#model-tabs[data-did]`) |
| Modelos + In the box | `GET /Handlers/VariantProduct.ashx?{data-variantlist-obj}` |
| Accesorios | `GET /Handlers/OptionalAccessoriesHandler.ashx?ids={data-ids}&culture=en-US` |
| Relacionados | `GET /Handlers/RelatedProducts.ashx?{data-productslider-obj}` |
| Reemplazos | `GET /Handlers/ReplacementProductsHandler.ashx?ids=&label=&culture=en-US` |

## Qué se captura y dónde queda

| Dato | Columna |
|---|---|
| Modelo | `modelNumber`, `manufacturerItem`, `originalName` |
| Subtítulo + descripción corta | `shortDescription`, `metaTitle`, `metaDescription` |
| Overview HTML + Key Features + notas al pie | `htmlContent` (HTML), `longDescription` (texto), `keyFeatures` (JSON string[]) |
| Tabla de specs con grupo › etiqueta › valor | `specifications` (JSON) |
| Alto / ancho / profundidad / peso (parseados de specs) | `heightCm`, `widthCm`, `depthCm`, `weight` |
| Galería (2500px, Widen CDN) | `ProductImage` con `source = "crestron"` |
| Badges (TAA, XiO Cloud, JITC, .AV Framework…) | `badges` (JSON) |
| Documentos (spec sheet, manuales, CAD, Revit, firmware…) | `documents` (JSON: name, url, type=sección, fileType) |
| URL oficial, slug, video | `vendorProductUrl`, `urlSlug`, `videoUrl` |
| Discontinuado | `isDiscontinued` |
| Modelo regulatorio | `regulatoryModel` |
| Ruta de categoría del fabricante | `sourceCategoryPath` |
| Fecha de publicación | `vendorPublishedAt` |
| Accesorios compatibles | `AccessoryRelation` kind `ACCESSORY` |
| Incluido en la caja (con cantidad) | `AccessoryRelation` kind `INCLUDED` (`quantity`) |
| Variantes (CP4 ↔ CP4N) | `AccessoryRelation` kind `MODEL_VARIANT` |
| Relacionados / "te puede interesar" | `AccessoryRelation` kind `RELATED` |
| Reemplazos (discontinuados) | `AccessoryRelation` kind `CROSS_SELL` |
| Todo lo demás (legal, warnings, handlers crudos) | `sourceMetadata.crestronCom` |

Las relaciones se resuelven contra `internalSku` (material number), `supplierSku` o `modelNumber`. Si el accesorio no existe en nuestra base, no se crea (queda en el raw).

## Traducción

Igual que Sonance: en modo `apply` se traducen `shortDescription` y `htmlContent` con `translateBatchCached` (caché en DB). Las specs quedan en inglés por ahora.

## Prueba sin base

```
npx tsx scripts/crestron-web-probe.ts 6511816 CP4
npx tsx scripts/crestron-web-probe.ts 6504877        # CP3, discontinuado
```

## Operación

- Lotes de 10 productos, 4 descargas en paralelo (~3 s por producto).
- Un producto que falla no frena el lote: queda registrado con el error en `sourceMetadata.crestronCom.error`.
- Cron: `sync.schedule["crestron-web"]` (deshabilitado por defecto, semanal a las 04:00 ART cuando se activa).
