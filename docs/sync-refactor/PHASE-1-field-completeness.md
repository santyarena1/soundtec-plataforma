# Fase 1 — Cero pérdida de campos (Crestron + Sonance)

> Objetivo: que cada sync escriba **todos** los campos que la fuente ya entrega y que
> el modelo `Product` ya tiene definidos (hoy quedan vacíos). **No** cambiar arquitectura
> en esta fase. **No** romper nada existente. Sistema sensible: comportamiento actual
> debe seguir intacto, solo se **agregan** escrituras de campos.

Regla de oro: **nunca sobrescribir un valor bueno con vacío/null.** Si la fuente no trae
un campo, no lo toques (usar `undefined` en el update de Prisma, no `null`).

---

## A) CRESTRON — `src/app/api/admin/crestron-sync/route.ts` (POST apply)

Fuente: `CrestronItem` (ver `src/services/crestron-sync.ts`). Match: `internalSku === ItemCode`.

Hoy el POST solo escribe: `baseCostUsd`, `stockStatus`, y la categoría (categoria/familia/rubro/subrubro).

### Agregar al objeto `data` del update (además de lo actual):

| Campo Product        | Origen `CrestronItem`                          | Regla |
|----------------------|------------------------------------------------|-------|
| `currency`           | `Currency`                                     | solo si viene no vacío |
| `discountPercent`    | `Discount`                                     | solo si `Discount != null` |
| `stockQuantity`      | `("07_available" ?? 0) + ("11_available" ?? 0)`| entero |
| `availabilityType`   | derivar de `toCrestronStockStatus` → `"INSTOCK"\|"LOWSTOCK"\|"ONREQUEST"\|"OUTOFSTOCK"` | |
| `availabilityMessage`| construir: p.ej. `` `Laredo: ${item["07_available"]??0} · Miami: ${item["11_available"]??0}${item.U_ETDCUS ? ` · ETD fábrica: ${item.U_ETDCUS}` : ""}` `` | |
| `sourceMetadata`     | el `item` completo (`item as unknown as object`)| guardar SIEMPRE el raw para no perder OnHand/OnOrder/IsCommited/etc. |
| `originalName`       | `ItemName`                                      | **solo si** el producto no tiene `originalName` o está vacío; **nunca** pisar `normalizedName` |

> Nota: `baseCostUsd = item.Price` y `stockStatus` se mantienen como están.
> El GET (preview) puede opcionalmente mostrar estos nuevos campos, pero no es obligatorio en Fase 1.

---

## B) SONANCE — `src/app/api/admin/sonance-import/enrich/route.ts`

Fuente: `PortalProductDetail` (ver `src/services/sonance-portal.ts`). Match: `supplierSku`.

Hoy escribe: `normalizedName`, `originalName`, `shortDescription`, `htmlContent`,
`longDescription`, `specifications`, `documents`, imágenes, accesorios (kind ACCESSORY),
`sourceMetadata`, `enrichedAt`, `translatedAt`.

### Agregar al `productUpdate` (todos con la regla "solo si viene valor"):

| Campo Product          | Origen `PortalProductDetail`         | Conversión / regla |
|------------------------|--------------------------------------|--------------------|
| `baseCostUsd`          | `basicListPrice`                     | **IMPORTANTE**: hoy el precio NO se actualiza en enrich (solo en create). Si `basicListPrice` viene y `> 0`, actualizarlo. |
| `modelNumber`          | `modelNumber`                        | |
| `manufacturerItem`     | `manufacturerItem`                   | |
| `metaTitle`            | `pageTitle`                          | |
| `metaDescription`      | `metaDescription`                    | |
| `metaKeywords`         | `metaKeywords`                       | |
| `salePriceUsd`         | `basicSalePrice`                     | solo si `> 0` |
| `salePriceStartsAt`    | `basicSaleStartDate`                 | `new Date()` si parseable, sino skip |
| `salePriceEndsAt`      | `basicSaleEndDate`                   | idem |
| `salePriceLabel`       | `salePriceLabel`                     | |
| `requiresQuote`        | `quoteRequired`                      | boolean directo |
| `availabilityMessage`  | `availability?.message`              | |
| `availabilityType`     | `availability?.messageType`          | |
| `badges`               | `badges`                             | guardar array `[{name}]` como Json si `length>0` |
| `weight`               | `shippingWeight`                     | parseFloat; solo si número válido `>0` (unidad: dejar tal cual, es peso de envío) |
| `heightCm`             | `shippingHeight`                     | parseFloat si válido |
| `widthCm`              | `shippingWidth`                      | parseFloat si válido |
| `depthCm`              | `shippingLength`                     | parseFloat si válido |
| `urlSlug`              | `urlSegment`                         | |
| `vendorProductUrl`     | `productDetailUrl ?? canonicalUrl`   | preferir productDetailUrl |
| `videoUrl`             | `properties?.videoUrl` (si existe)   | solo si string no vacío |
| `isActive`             | derivar: si `isDiscontinued === true` → **NO** desactivar automáticamente (riesgo). En su lugar guardar en `availabilityType`/sourceMetadata. **Dejar `isActive` intacto.** | seguridad |

### Relaciones adicionales (dentro de la misma `$transaction`):

Hoy solo se linkean accesorios `kind=ACCESSORY`. Agregar, con el mismo patrón
(deleteMany por kind + createMany skipDuplicates, solo linkear si el producto existe en DB):

- `detail.crossSells` → `AccessoryRelation` con `kind = "CROSS_SELL"`
- `detail.alsoPurchasedProducts` → `AccessoryRelation` con `kind = "ALSO_PURCHASED"`

Reusar el helper `pickAccessorySkus(...)` para extraer supplierSku de cada lista.
Construir un único set de SKUs (accessories + crossSells + alsoPurchased) para la query
`prisma.product.findMany` de resolución de IDs (hoy solo busca accessories).

### Traducciones (no perder lo que ya hay)
Mantener el flujo de traducción actual tal cual. Los campos nuevos de texto que se podrían
traducir (metaDescription) **no** se traducen en Fase 1 para no ampliar el scope; se guardan
en el idioma origen.

---

## Verificación obligatoria al terminar (sistema sensible)
1. `pnpm tsc --noEmit` (o `npm run build`) verde.
2. Confirmar que ningún campo previamente escrito dejó de escribirse (diff de los dos archivos).
3. Confirmar regla "solo si viene valor": ningún update mete `null` donde antes había dato.
4. Probar el enrich/apply contra 1 producto real y verificar en DB que los campos nuevos se llenaron y los viejos siguen intactos.

---

## A.2) CRESTRON — campos EXTRA descubiertos en la API real (hallazgo Chrome)

La API `/api/SBO_PROD_USA/precios-dt` devuelve MÁS campos de los que el interface
`CrestronItem` declara hoy. Estos se pierden como columnas estructuradas (el raw sí
queda en `sourceMetadata` gracias a la Fase 1). Extender el interface `CrestronItem`
en `src/services/crestron-sync.ts` y mapear los útiles:

| Campo API      | Ejemplo                    | Destino en Product | Regla |
|----------------|----------------------------|--------------------|-------|
| `SWeight1`     | `1`                        | `weight` (kg)      | number, solo si `>0` |
| `SVolume`      | `1`                        | `volume` (m³)      | number, solo si `>0` |
| `CodeBars`     | `"3001352"`                | (no hay campo) → queda en sourceMetadata | — |
| `PicturName`   | `"SW-3SERIES-BACNET-50+.PNG"` | imagen (pendiente base URL; `/media/` da 500, falta subpath) | por ahora solo sourceMetadata |
| `TaxCodeAR`    | `null`                     | (fiscal) sourceMetadata | — |
| `SalPackMsr`/`SalPackUn` | `null`/`1`       | sourceMetadata     | — |
| `Rate`         | `null`                     | sourceMetadata     | — |

Acción mínima Fase 1: agregar `SWeight1?: number; SVolume?: number; CodeBars?: string; PicturName?: string; TaxCodeAR?: string|null; SalPackMsr?: string|null; SalPackUn?: number|null; Rate?: number|null;` al interface `CrestronItem`, y en el POST apply mapear `weight` y `volume` con la regla "solo si número válido > 0". El resto ya está cubierto por `sourceMetadata`.
