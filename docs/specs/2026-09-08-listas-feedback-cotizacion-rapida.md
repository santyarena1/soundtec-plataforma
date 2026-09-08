# Spec — Listas compartibles en operación · Feedback de IA con detalle · Cotización rápida

Tres entregas independientes en la misma corrida. No tocar `prisma/schema.prisma` salvo lo indicado en §2 y §3 (cambios aditivos, chicos).

---

## 1. Listas compartibles ("ponerlas en operación")

Estado: el flujo existe (crear, filtros, slug público `/lista/[slug]`, precios, expiración, contador). Falta que sea usable de punta a punta. Archivos: `src/app/admin/share-lists/**`, `src/components/admin/share-list-form.tsx` (350), `src/lib/shareable-price-list.ts`, `src/server/actions/shareable-price-lists.ts`, `src/app/lista/[slug]/**`.

Hacer:
1. **Selector de productos server-side**: reemplazar el `findMany({ take: 500 })` de `new/page.tsx` y `[id]/page.tsx` por búsqueda bajo demanda (server action `searchProductsForShareList({ q, brandIds, categoryIds, take: 50 })` con debounce en el cliente, chips de seleccionados/excluidos con nombre + SKU). Reusar `SearchablePick` o un pequeño buscador propio.
2. **Crear lista desde el catálogo**: en `src/app/admin/products/catalog-admin.tsx`, en la barra de acciones masivas (`bulk-bar.tsx`), agregar "Crear lista compartible con los seleccionados" → navega a `/admin/share-lists/new?productIds=a,b,c` y el formulario los precarga como productos específicos.
3. **Página pública** `/lista/[slug]`: `metadata` dinámico (título = nombre de la lista, `robots: noindex, nofollow`), paginación o carga incremental si hay más de 200 productos (mostrar "Mostrando X de Y"), y CTA al final y en el header: "Pedir cotización de esta lista" → `mailto:` configurable (`AdminSetting share_lists.contact_email`, default `contacto@soundtec.com.ar`) con asunto prellenado con el nombre de la lista; si el visitante está logueado como cliente, botón "Agregar todo a mi pedido" que llama a `bulkAddToDraftSimple` con los productIds visibles (reusar la action existente en `src/server/actions/requests.ts`).
4. **`hidePrices` de verdad**: cuando `hidePrices` es true, no ejecutar el motor de precios y no serializar `pricing` al cliente (mapear a `pricing: null` antes de pasar props).
5. **Registro de vistas**: modelo nuevo `ShareablePriceListView { id, listId, viewedAt, userAgent?, referer?, ipHash? }` (relación con `ShareablePriceList`, `onDelete: Cascade`). Registrar en cada vista (fire-and-forget) y mostrar en `/admin/share-lists/[id]` "Últimas vistas" (fecha, dispositivo) y en la lista la última vista.
6. **Admin**: confirmación antes de borrar (`ConfirmDialog`), botón "Duplicar lista", "Enviar por WhatsApp" (link `https://wa.me/?text=` con nombre + URL) y "Copiar link" ya existe. Arreglar el bug de `kinds` en el formulario de edición (si `list.filters.kinds` es `undefined`, no re-guardar ambos tildados; conservar `undefined`).
7. `shareListPublicUrl`: si no hay `NEXT_PUBLIC_APP_URL`/`APP_URL`/`NEXTAUTH_URL`, usar `VERCEL_PROJECT_PRODUCTION_URL` o `VERCEL_URL` con `https://` antes del fallback localhost.
8. Mover el link del nav al grupo de precios (si la tarea de imports ya lo movió, no duplicar).

## 2. Feedback de IA con detalle + en Catálogo

Defectos confirmados en `src/app/portal/products/[id]/ai-content-notice.tsx` y `src/server/actions/ai-feedback.ts`:
- "Tiene errores" nunca envía el comentario (se manda `comment: ""`), y el comentario después crea **otra fila**.
- `generatedText` nunca se guarda.
- No hay campo estructurado de "qué estaba mal".
- El admin (`src/app/admin/feedback/page.tsx`) trunca el comentario a 80 chars, sin detalle, `take: 80`, sin filtros, y mapea mal `UNCLEAR`.

Hacer:
1. Schema: agregar a `AiContentFeedback` el campo `issues String[] @default([])` (valores: `"specs_wrong"`, `"wrong_product"`, `"price_or_availability"`, `"compatibility"`, `"language"`, `"missing_info"`, `"other"`) y `resolvedAt DateTime?`, `resolvedById String?` (+ relación a User `AiFeedbackResolver`).
2. Componente del portal: al tocar "Tiene errores" se despliega **en el mismo paso** un panel con checkboxes de motivos (labels en español: "Especificaciones incorrectas", "Describe otro producto", "Precio o disponibilidad", "Compatibilidad / accesorios", "Redacción o idioma", "Falta información", "Otro") + textarea "Contanos qué corregirías" (obligatorio si eligió "Otro") + botón "Enviar reporte". **Una sola fila** por envío con `verdict: HAS_ERRORS`, `issues`, `comment` y `generatedText` = la descripción mostrada (pasarla como prop desde la página). "Sí, es correcta" envía `CORRECT` con `generatedText`. Si ya existe un feedback del mismo usuario para el mismo producto y tipo, **actualizarlo** (upsert por `userId+type+refId`, tomar el último por `createdAt`). Mostrar estado "Gracias, ya recibimos tu reporte" con el detalle enviado y opción "Editar reporte".
3. La lectura del feedback existente en `src/app/portal/products/[id]/page.tsx:132` debe ordenar por `createdAt desc`.
4. Admin `/admin/feedback`: rehacer la tabla: filtros (veredicto, tipo, resuelto/pendiente, búsqueda por producto), paginación 50, columna "Motivos" (badges), comentario completo con "ver más", botón por fila que abre un `Modal` con: producto (link), usuario, fecha, motivos, comentario completo, **texto generado que vio el usuario** vs **descripción actual** (lado a lado), y acciones "Marcar resuelto" / "Ir a editar la ficha". Corregir el label de `UNCLEAR` → "Sin definir".
5. **En Catálogo** (`src/app/admin/products/**`): (a) en `page.tsx` agregar filtro `feedback=errors` (productos con al menos un `AiContentFeedback` `HAS_ERRORS` sin resolver) y chip en la barra de filtros "Con reportes de IA (n)"; (b) en `catalog-admin.tsx` una columna/badge "Reportes" con el número de reportes abiertos, clickeable → abre el mismo modal de detalle; (c) en `/admin/products/[id]` (sección de descripciones, `descriptions-section.tsx`) un bloque "Reportes de los clientes sobre esta descripción" con la lista de reportes abiertos (motivos + comentario + texto que vieron) y "Marcar resuelto". Server action `resolveAiFeedback(id)` y `listProductAiFeedback(productId)`.
6. Dejar `/admin/feedback` como vista global (los reportes viven en catálogo y ahí).
7. `Product.aiDescriptionFeedbackStatus`: usarlo de verdad: badge en el catálogo ("Descripción reportada") cuando es `REJECTED`; al marcar resuelto todos los reportes de un producto, volver a `null`.

## 3. Cotización rápida (coexiste con el flujo actual)

Pedido: *"una operación para crear cotizaciones rápidas, como las que se arman medio predeterminadas cuando un cliente manda una solicitud, algo así más rápido y simple, pero no elimines lo que existe"*.

Hoy: `/admin/quotes/new` es un intake largo (brief, planos, clasificadores, IA). El primitivo reusable es `createQuoteShell` en `src/server/actions/quotes.ts`, y `createQuoteFromRequest` ya arma ítems con precios del cliente.

Hacer:
1. Nueva página **`/admin/quotes/quick`** ("Cotización rápida") con un formulario de una sola pantalla, client component (`src/app/admin/quotes/quick/quick-quote-form.tsx`, < 400 líneas; separar `quick-quote-items.tsx`):
   - Cliente (`SearchablePick` de clientes activos; opcional, con aviso "sin cliente no se puede emitir") + contacto (texto) + referencia (texto, default "Cotización rápida {fecha}").
   - **Buscador de productos con teclado**: input que busca (`searchProductsForQuote` existente) mostrando nombre, SKU, marca, stock y **precio para ese cliente** (usar `calculatePricesForProducts` con el `clientId` elegido; recalcular precios de la tabla si cambia el cliente). Enter agrega con cantidad 1. También aceptar **pegar una lista** "SKU  cantidad" (una por línea, separador tab/coma/espacio) con botón "Agregar varios" que resuelve por `internalSku`/`supplierSku`/`modelNumber` y reporta los que no encontró.
   - Tabla de ítems editable: cantidad, precio unitario (prellenado con el precio calculado, editable), descuento % de línea opcional, nota, quitar; subtotal, IVA (usar `terms`/`ivaRate` por defecto que ya usa `createQuoteShell`), total. Soporte de accesorios: al agregar un producto principal, sugerir sus accesorios `INCLUDED` (marcarlos como incluidos sin precio) y `ACCESSORY` (tildables).
   - Opciones mínimas: plantilla (`layoutKey` COMPACT por defecto), validez en días (default el de `defaultTerms`), moneda USD.
   - Botones: **"Crear y emitir PDF"** (crea el shell con `createQuoteShell`, carga ítems como `QuoteItem` con `source: MANUAL` o el equivalente existente, fija los textos mínimos de los módulos (sin IA), ejecuta `issueQuote`; si `quoteIssueCheck` devuelve errores, mostrarlos y quedarse en la pantalla) y **"Guardar como borrador y abrir el editor"** (redirige a `/admin/quotes/[id]?paso=4`).
   - Al terminar: pantalla de éxito con número, link al PDF, "Enviar al cliente por email" (mailto con link) y "Adjuntar a una solicitud" (select de solicitudes abiertas del cliente → `attachQuoteAsRequestResponse`).
2. Server action `createQuickQuote(input)` en un archivo nuevo `src/server/actions/quick-quote.ts` (validación zod, devuelve `{ok, quoteId, number, pdfUrl?, errors?}`), reusando `createQuoteShell`, el helper de precios y `issueQuote`. No modificar el comportamiento de `createQuoteFromBrief`/`createQuoteFromRequest`.
3. Accesos: botón "Cotización rápida" en `/admin/quotes` (lista) junto a "Nueva cotización", en el dashboard admin (`src/app/admin/page.tsx`) como acción rápida, y en la ficha del cliente si el módulo de clientes expone un slot (si no existe, omitir).
4. Permiso: `quotes.create`.

## 4. Verificación

- `npx prisma generate` y `npx tsc --noEmit` en verde. No `prisma db push`, no `next build`.
- Changelog en `src/data/admin-changelog.ts`: versión 1.13.1, id `ship-2026-09-08-5` (listas compartibles + feedback + cotización rápida).
- No tocar: `src/app/admin/sync/**`, `src/app/admin/imports/**`, `src/app/admin/clients/**`, `src/app/admin/users/**`, `src/app/admin/margins/**`, `src/app/admin/discounts/**`, `src/app/admin/_rules/**`, `src/services/**`, `src/app/page.tsx`, `src/app/portal/page.tsx`. No renombrar "solicitud" (se hace en otra pasada).
