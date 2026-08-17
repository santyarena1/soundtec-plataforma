# Estado del refactor de sincronización + Runbook de verificación

## Qué quedó hecho (branch `feat/sync-refactor`)

### Fase 1 — Cero pérdida de campos (commit 626bd74) ✅ verificado (tsc + next build)
- Crestron apply y Sonance enrich ahora escriben TODOS los campos que la fuente entrega.
- Regla de oro: nunca se pisa un valor bueno con null (undefined = skip en Prisma).
- Descubrimiento (Chrome, sesión Xtrabon real): la API `precios-dt` devuelve más campos
  de los que el código parseaba (`SWeight1`, `SVolume`, `CodeBars`, `PicturName`, etc.).
  Peso y volumen ahora se mapean; el resto queda en `sourceMetadata` crudo.

### Fase 2/3/4 — Capa unificada (commit 3d990a2) ✅ verificado (tsc + next build; falta dry-run con DB)
- `src/services/sync/`: connector interface + registry + connectors Crestron/Sonance +
  pipeline (SyncRun) + upsert full-field.
- Endpoints admin `/api/admin/sync/*` + cron `/api/cron/sync` (Bearer CRON_SECRET).
- UI única `/admin/sync` (preview → apply, progreso, runs recientes).
- Modelos Prisma `SyncRun`/`SyncStagedProduct` (aditivos; se crean con `db push`).
- `vercel.json` con crons (Crestron diario 06:00 UTC, Sonance lunes 05:00 UTC).
- Los endpoints/servicios VIEJOS siguen intactos y son el path autoritativo full-feature.

## ✅ Paridad total (Fase 5, commit 8c051f7)
El pipeline nuevo ya replica las dos features que faltaban:
1. **Traducción ES (Sonance).** `translateItems` en el connector, batch con `translateBatchCached`
   (nombre/desc/html/specs/docs), SOLO en mode apply, aislada de errores (no aborta el batch).
2. **Categoría Crestron (EN→ES).** El connector carga `crestron.category_target` +
   `crestron.category_translations`, hace find-or-create de Category/ProductFamily, y mapea a
   categoria/familia/rubro/subrubro. `upsert` resuelve familyName.
> Con esto el pipeline nuevo iguala a los flujos viejos. Los viejos siguen vivos hasta que el
> dry-run con DB confirme paridad de datos; recién ahí se pueden deprecar.

## 🔴 Runbook de verificación con DB (pendiente — DB local estaba apagada)
Cuando el Postgres local (`localhost:5433`) esté levantado, o directamente en el deploy:

1. **Aplicar el schema nuevo** (crea SyncRun/SyncStagedProduct):
   ```
   npm run db:push          # o: npx prisma db push
   ```
   (En Vercel esto corre solo en cada build vía el script `build`.)

2. **Configurar el secreto de cron** en el entorno:
   ```
   CRON_SECRET="<secreto-largo-aleatorio>"
   ```

3. **Dry-run seguro (NO escribe productos):** abrir `/admin/sync`, elegir Crestron,
   clic en **Previsualizar**. Verificar:
   - matched > 0, priceChanges/stockChanges razonables.
   - En DB: `SELECT count(*) FROM "Product" WHERE "updatedAt" > now() - interval '5 min';`
     debe seguir en 0 (preview no toca Product, solo SyncStagedProduct).

4. **Apply real controlado:** con un backup/confianza, clic en **Sincronizar ahora** (Crestron
   primero, es una sola pasada). Verificar en un producto conocido que los campos nuevos se
   llenaron y los viejos (nombre ES, categoría, imágenes propias) siguen intactos.

5. **Sonance:** Previsualizar → revisar → Sincronizar (batches automáticos server-side).
   Comparar contra el enrich viejo hasta cerrar paridad de traducción.

6. **Cron:** probar manual con header:
   ```
   curl -H "Authorization: Bearer $CRON_SECRET" "https://<deploy>/api/cron/sync?source=crestron&mode=apply"
   ```

## Regla de seguridad mantenida en todo
- Nunca desactivar productos automáticamente.
- Nunca pisar valor bueno con null.
- Match keys sin cambios (Crestron internalSku, Sonance supplierSku).
