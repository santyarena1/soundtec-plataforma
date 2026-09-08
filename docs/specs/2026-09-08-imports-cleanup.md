# Spec — Limpieza y consolidación del módulo "Listas e importación"

Objetivo del usuario: *"Hay que eliminar lo que no sirve y mejorar al 100% el módulo de admin de LISTAS E IMPORTACIÓN, hay mucho que no se usa y mucho que sobreescribe otras cosas, pero siempre haciendo que funcione al máximo lo que ya tenemos."*

Regla de oro: **no perder funcionalidad que hoy se usa**. Lo que se borra es lo huérfano (0 referencias), lo falso (features que dicen hacer algo y no lo hacen) y lo duplicado. Lo clásico que sí funciona se reorganiza y se le corrigen las sobrescrituras.

## 1. Navegación (`src/components/layout/admin-sidebar-nav.tsx` líneas 66–78)

Grupo "Listas e importación" queda con **3 entradas**:

1. `/admin/sync` — **Sincronización** (Crestron Xtrabone, Crestron.com, Sonance)
2. `/admin/imports` — **Importar Excel**
3. `/admin/share-lists` — se mueve al grupo de precios/visibilidad (donde estén Márgenes/Descuentos/Visibilidad) con label **Listas compartibles**.

Mover `/admin/ncm` al grupo de Catálogo (label "Posiciones NCM"). Eliminar del nav: `/admin/crestron-sync`, `/admin/sonance-import`, `/admin/mappings`, `/admin/scrapers`.

## 2. `/admin/sync` absorbe la configuración de los flujos clásicos

En `src/app/admin/sync/_client.tsx` (1190 líneas — **partirlo**: extraer a `src/app/admin/sync/_components/*.tsx` al menos: `source-picker.tsx`, `run-panel.tsx`, `runs-history.tsx`, `schedule-panel.tsx`, `source-settings.tsx`) agregar un panel **"Configuración de fuentes"** con:

- **Crestron (Xtrabone)**: usuario/contraseña (`crestron.username`, `crestron.password` en AdminSetting, password nunca se devuelve al cliente, sólo "configurada: sí/no"), destino de categoría (`crestron.category_target`: categoria|familia|rubro|subrubro) y editor de traducciones EN→ES (`crestron.category_translations`) con botón "Traducir con IA" que llama a `POST /api/admin/crestron-sync/translate` (ese endpoint se mantiene).
- **Sonance**: usuario/contraseña del portal (`sonance.portal_username`, `sonance.portal_password`), destino de categoría (`sonance.category_target`) y traducciones (`sonance.category_translations`) con `POST /api/admin/sonance-import/translate` (se mantiene).

Reusar el código de formularios que hoy vive en `src/app/admin/crestron-sync/_client.tsx` y `src/app/admin/sonance-import/_client.tsx` (copiar los sub-componentes que hagan falta, no importar desde las páginas viejas). Crear las server actions o rutas API mínimas para guardar esas settings si no existen (`src/app/api/admin/sync/settings/route.ts` GET/POST, admin-only, validando con zod).

Agregar en `/admin/sync` un link discreto al pie: **"Herramientas clásicas"** → `/admin/sync/legacy`, página nueva que sólo lista links a `/admin/crestron-sync` y `/admin/sonance-import` con un aviso "Flujos anteriores. Usalos sólo si el pipeline nuevo no cubre algo; escriben directo en productos sin diff ni rollback." Las páginas clásicas siguen existiendo y funcionando, pero fuera del nav.

## 3. Borrar (0 referencias o features falsas)

- `src/app/api/admin/crestron-sync/diag/route.ts`
- `src/app/api/admin/sonance-import/backfill-brand-by-keyword/`, `backfill-brand-from-index/`, `cleanup-orphan-brands/`, `reassign-brands-from-api/`, `inspect/`, `probe-brand-data/`
- `src/app/admin/scrapers/**`, `src/server/actions/scrapers.ts`, `src/scrapers/**` (sólo existe `mockScraper`; la página promete escribir RawImportedProduct y no lo hace). Si `src/scrapers` exporta tipos usados en otro lado, mover esos tipos.
- `src/app/admin/mappings/page.tsx`: eliminar la página. En su lugar, en `/admin/imports` agregar una sección "Perfiles de mapeo guardados" (lista de `ColumnMappingProfile` con nombre, proveedor/marca, fecha) y hacer que **realmente se reutilicen**: en `startImportFromExcel` (`src/server/actions/imports.ts`), si existe un perfil cuyo `distributorId`/`brandId` coincide y cuyas columnas (`mappingJson` keys) están todas en `detectedHeaders`, aplicarlo como `suggestedMapping` antes de llamar a la IA. Permitir borrar un perfil (server action `deleteColumnMappingProfile`).
- `src/services/sonance-import.ts`: sólo se importan sus tipos. Mover los tipos usados a `src/services/sonance-portal.ts` (o a un `sonance-types.ts`) y borrar el archivo. Verificar con grep que ningún import quede roto.
- Quitar el botón/endpoint `backfill-accessory-kind` de la UI clásica de Sonance y borrar la ruta (duplica lógica de apply-mapping).

## 4. Corregir sobrescrituras (manteniendo los flujos)

1. `src/server/actions/imports.ts` `approveAllRows` (L163-232): el upsert por `internalSku` **no debe pisar** `normalizedName`, `originalName`, `shortDescription`, `longDescription`, `brandId`, `distributorId` cuando el producto ya existe y el campo ya tiene valor. Sólo escribir esos si están vacíos. Siempre escribir: `baseCostUsd`, `currency`, `supplierSku`, `discountPercent` (si vienen). Mostrar en la UI de aprobación un texto: "Los productos existentes sólo actualizan precio, SKU de proveedor y descuento; nombre y descripciones se conservan."
2. `src/app/api/admin/sonance-import/enrich/route.ts` (~L399-401, L418): no pisar `normalizedName`/`originalName` si ya existen. No pisar `shortDescription`/`longDescription`/`htmlContent` si `product.aiGeneratedDescription === true` o si ya tienen valor, salvo `force=true` en el body (mismo criterio que crestron enrich).
3. `src/app/api/admin/sonance-import/apply-mapping/route.ts`: si el usuario mapeó explícitamente `brandId`, respetarlo (no pisar con la heurística de keywords en L604-608). El `updateMany` masivo de `brandId` post-proceso (L93) sólo debe tocar productos con `brandId == null`.
4. `src/app/api/admin/crestron-sync/route.ts` (L299) y `src/app/api/admin/sonance-import/sync-full/route.ts` (L249): `sourceMetadata` se **mergea por clave** en vez de reemplazarse (mismo comportamiento que `mergeSourceMetadata` en `src/services/sync/upsert.ts`; exportar ese helper desde un módulo compartido `src/services/sync/source-metadata.ts` y usarlo en los tres lugares).
5. Todo camino clásico que escriba en `Product` debe actualizar `fieldUpdatedAt` usando `mergeFieldTimestamps` de `src/lib/field-timestamps.ts` con la lista de campos que efectivamente escribió (así `field-stamp.tsx` no miente).

## 5. `/admin/imports`

- Mantener el flujo Excel completo.
- Página de lista: agregar filtro por estado y proveedor, y la sección "Perfiles de mapeo guardados" (punto 3).
- En `/admin/imports/[id]`: mostrar qué campos de Product va a escribir la aprobación (según la política del punto 4.1).

## 6. Verificación

- `npx tsc --noEmit` en verde. No correr `next build` ni `prisma generate` (otra tarea en paralelo toca el schema; **esta tarea no modifica `prisma/schema.prisma`**).
- `grep -rn` para confirmar que ningún import apunta a archivos borrados.
- Agregar entrada en `src/data/admin-changelog.ts` (versión 1.12.1, id `ship-2026-09-08-2`) describiendo la limpieza en español, tono del resto del archivo.
- No tocar: `src/services/sync/**` (salvo crear `source-metadata.ts`), `src/services/crestron-web/**`, `src/app/portal/**`, `src/app/admin/clients/**`, `src/app/admin/users/**`, `src/app/admin/margins/**`, `src/app/admin/discounts/**`, `src/app/admin/_rules/**`.
