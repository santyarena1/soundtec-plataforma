# Spec — Vista por producto en Márgenes y Descuentos

Pedido del usuario: *"En la sección de márgenes y descuentos, quiero que en cada módulo muestres una lista de productos y hagas una lista de los productos que tienen algún margen o descuento aplicado y cuáles no, y al tocar uno de esos productos que no tiene, que me digas si quiero aplicar un margen o descuento a ese producto, a esa familia, categoría, marca, etc. (todas las opciones que ya tenemos) y si quiero aplicarlo a más de una. Pero si toco un producto que ya tiene margen o descuento que me diga las reglas que tiene y si quiero editarlas y si pongo para editar que me dé todas las opciones de vuelta como para editar en profundidad."*

Aplica igual a `/admin/margins` (kind = margin) y `/admin/discounts` (kind = discount). Reusar todo lo existente: `RulesForm` (`src/app/admin/_rules/rules-form.tsx`), `RulePreviewModal`, `PricingRulesWorkspace`, `pricing-rules.ts` actions, `calculatePricesForProducts` (`src/lib/pricing.ts`), `SearchablePick`, `Modal`.

## 1. Nuevo server action: cobertura de reglas por producto

En `src/server/actions/pricing-rules.ts` (o un nuevo `src/server/actions/pricing-coverage.ts`):

```ts
export async function listProductRuleCoverage(input: {
  kind: "margin" | "discount";
  q?: string;
  brandIds?: string[]; categoryIds?: string[]; familyIds?: string[]; distributorIds?: string[];
  coverage?: "all" | "with_rule" | "without_rule";
  clientId?: string | null;     // null = reglas globales (sin cliente)
  page?: number; pageSize?: number; // 25/50/100
}): Promise<{ ok: true; total: number; withRule: number; withoutRule: number; items: ProductCoverageRow[] } | { ok: false; error: string }>
```

`ProductCoverageRow = { id, name, sku, brandName, categoryName, familyName, imageUrl, baseCostUsd, appliedRule: AppliedRule | null, appliedRuleRow: PricingRuleRow | null, candidateRules: PricingRuleRow[] /* todas las reglas activas cuyo scope alcanza al producto, en orden de precedencia */, source: "RULE" | "PRODUCT_FIELD" | "COEF_VTA" | "DEFAULT" | "NONE" }`.

Implementación: paginar productos activos con los filtros (misma construcción de `where` que `src/app/admin/products/page.tsx`), luego `calculatePricesForProducts(rows, clientId)` y leer `appliedMarginRule` / `appliedDiscountRule` + `markupSource` / `discountSource`. "Tiene regla" = para margin: `markupSource === "RULE"`; para discount: `appliedDiscountRule != null` o `discountSource === "PRODUCT"` (mostrar como "Descuento del producto"). Para los contadores `withRule/withoutRule` sobre el total filtrado, hacer el cálculo en lotes de 500 (no traer 4000 con include pesado; sólo los campos que necesita `ProductPricingInput`). Cachear nada; es una vista admin.

`candidateRules`: reusar la lógica de matching de `pricing.ts` — exportar desde ahí un helper `findCandidateRules(rules, productInput, clientId)` que devuelva los matches por nivel sin cortar en el primero (refactor mínimo: extraer el `matcherChain` a una función pura reutilizable; no cambiar el resultado de `calculateCustomerPrice`).

## 2. UI: tab "Por producto" en ambos módulos

En `PricingRulesWorkspace` (`src/app/admin/_rules/workspace.tsx`) agregar `Tabs` (de `src/components/ui/tabs.tsx`, sincronizando `?view=rules|products` en la URL):
- **Reglas** (lo que hay hoy).
- **Por producto** (nuevo): `src/app/admin/_rules/product-coverage-view.tsx` (client component, < 400 líneas; separar `coverage-filters.tsx`, `coverage-table.tsx`, `coverage-product-modal.tsx`).

### Vista Por producto
- Barra superior: buscador (debounce 300 ms), `MultiSelectFilter`-style para marca/categoría/familia/proveedor (reusar `SearchablePick multiple`), selector de "Ver como": "Reglas globales" o un cliente (`SearchablePick` de clientes), y **chips de cobertura**: `Todos (N)` · `Con regla (n)` · `Sin regla (m)` con colores (success/warning).
- Tabla: imagen, producto (nombre + SKU), marca, categoría/familia, costo, columna **Regla aplicada**: badge verde con nombre de la regla + alcance (`describeRuleAppliesTo`) + valor (markup ×/margen % o descuento %), o badge ámbar "Sin regla" (margen: mostrar "usa coef. venta del producto" o "usa markup por defecto ×1.35" según `markupSource`; descuento: "Sin descuento" o "Descuento del producto X%").
- Selección múltiple con checkboxes + barra de acciones: "Aplicar regla a los N seleccionados" (abre el modal en modo creación con `target = PRODUCT` y `scopeIds` = seleccionados).
- Paginación (25/50/100) y estado en la URL.

### Modal al tocar un producto (`coverage-product-modal.tsx`)
Cabecera: imagen, nombre, SKU, marca › categoría › familia, costo base y precio resultante actual (usar el breakdown).

**Caso A — sin regla:** texto "Este producto no tiene {margen|descuento} propio. ¿A qué querés aplicarle uno?" y una grilla de opciones (cards clickeables) con lo que la regla puede abarcar, cada una con el conteo de productos que abarcaría:
- Sólo este producto
- Todos los de la marca «X» (n productos)
- Toda la categoría «Y» (n)
- Toda la familia «Z» (n)
- Todo el proveedor «W» (n)
- Todo el catálogo
- Checkbox "Aplicar a varios a la vez" que permite tildar más de una opción; y "Elegir otros productos…" que abre `RulePreviewModal`/buscador para sumar productos.
Al continuar se abre `RulesForm` **prellenado** (audience según el selector de cliente de la vista, target y scopeIds según lo tildado; si tildó más de una opción, crear una regla por opción compartiendo `groupId` — usar la capacidad de combos que ya tiene `saveRuleRows`). Al guardar, refrescar la tabla y cerrar.

**Caso B — con regla:** listar `candidateRules` en orden de precedencia, marcando la que gana ("Aplicada") y explicando por qué (nivel del `matcherChain`, ej. "Cliente + Marca gana sobre Global"). Cada regla con botones **Editar** (abre `RulesForm` en modo edición completo, `editMode="one"`), **Editar grupo** (si tiene `groupId`), **Desactivar** y **Quitar**. Botón "Agregar otra regla para este producto" que lleva al Caso A.

## 3. Detalles

- Todo en español, tono del resto del admin. Mantener accesibilidad básica (botones con `aria-label`, foco en el modal).
- No cambiar el motor de pricing más allá del refactor puro de `matcherChain`. Agregar tests unitarios mínimos para `findCandidateRules` si existe infraestructura de tests (si no hay runner configurado, no agregar).
- Borrar los componentes muertos `src/components/admin/margin-priority-guide.tsx` y `pricing-preview-card.tsx` si siguen sin usarse (o usarlos en el modal si aportan).

## 4. Verificación

- `npx tsc --noEmit` en verde. No `prisma generate`, no `next build`, **no tocar `prisma/schema.prisma`**.
- Entrada en `src/data/admin-changelog.ts`: versión 1.12.2, id `ship-2026-09-08-4`.
- No tocar: `src/app/admin/sync/**`, `src/app/admin/imports/**`, `src/app/admin/clients/**`, `src/app/admin/users/**`, `src/app/portal/**`, `src/services/**`.
