# Fase 2–4 — Arquitectura unificada de sincronización

> Objetivo: una sola tubería que todos los proveedores reusan. Más simple, cero pérdida,
> cron + manual. Sistema sensible: los endpoints viejos siguen vivos hasta verificar los nuevos.
> Regla de oro sigue vigente: nunca pisar un valor bueno con null (undefined = skip en Prisma).

## Principio de diseño
- **Envolver, no reescribir.** La lógica de fetch que ya funciona (`crestron-sync.ts`,
  `sonance-portal.ts`) se reutiliza. Los connectors la adaptan a una interfaz común.
- **Una sola fuente de verdad para el mapeo** campo-por-campo (lo de Fase 1) vive en el connector.
- **Estado en tabla real**, no en `AdminSetting` chunked.

## Estructura de archivos nueva
```
src/services/sync/
  types.ts          NormalizedProduct DTO (superset de campos writables de Product) +
                    ProductSourceConnector interface + tipos preview/result
  http.ts           cliente node:https compartido (cookies, redirects, CSRF) — consolida
                    las 3 reimplementaciones. NO borrar las viejas todavía (riesgo); las
                    nuevas connectors usan esta.
  upsert.ts         applyNormalizedProduct(tx, normalized): upsert full-field con regla de oro
  registry.ts       getConnector(slug), listConnectors()
  connectors/
    crestron.ts     fetchNormalized(): usa fetchCrestronPriceList() → NormalizedProduct[]
                    (mueve el mapeo de Fase 1 del route acá; el route viejo puede delegar)
    sonance.ts      fetchNormalized({offset,batchSize}): listing + detalle resumible
  pipeline.ts       runPreview(connector), runApplyBatch(connector, syncRunId, offset)
```

## NormalizedProduct (DTO)
Un objeto plano con TODOS los campos writables de Product como opcionales, más:
- `matchField: "internalSku" | "supplierSku"` y `matchValue: string` (clave de match)
- `raw: unknown` (para sourceMetadata)
- listas opcionales: `images[]`, `specifications[]`, `documents[]`, `accessories/crossSells/alsoPurchased` (SKUs)
El connector llena solo lo que la fuente da. `upsert.ts` traduce a Prisma con undefined-skip.

## Modelos Prisma nuevos (Fase 4 — migración)
```prisma
enum SyncSourceKind { CRESTRON SONANCE EXCEL MANUAL }
enum SyncRunStatus { PENDING RUNNING PREVIEW_READY APPLYING COMPLETED FAILED CANCELLED }
enum SyncRunTrigger { MANUAL CRON }

model SyncRun {
  id          String   @id @default(cuid())
  source      SyncSourceKind
  status      SyncRunStatus @default(PENDING)
  trigger     SyncRunTrigger @default(MANUAL)
  mode        String   // "preview" | "apply"
  totalItems  Int      @default(0)
  processed   Int      @default(0)
  matched     Int      @default(0)
  created     Int      @default(0)
  updated     Int      @default(0)
  priceChanges Int     @default(0)
  stockChanges Int     @default(0)
  errors      Int      @default(0)
  stats       Json?    // resumen libre (brandCounts, etc.)
  error       String?
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  staged      SyncStagedProduct[]
  @@index([source]) @@index([status])
}

model SyncStagedProduct {
  id          String   @id @default(cuid())
  syncRunId   String
  syncRun     SyncRun  @relation(fields:[syncRunId], references:[id], onDelete: Cascade)
  matchValue  String
  rawJson     Json
  normalizedJson Json
  diffJson    Json?    // {campo: {from, to}}
  action      String   // "create" | "update" | "noop"
  status      String   @default("pending") // pending|applied|error
  productId   String?
  error       String?
  createdAt   DateTime @default(now())
  @@index([syncRunId]) @@index([matchValue])
}
```

## Cron + manual (Fase 3)
- `vercel.json` con crons: Crestron diario, Sonance semanal (ajustable).
- `GET /api/cron/sync?source=crestron` protegido con `Authorization: Bearer ${CRON_SECRET}`.
  Corre preview+apply en modo automático; para Sonance itera batches internamente hasta done
  (respetando maxDuration; si no termina, reencola vía SyncRun.processed).
- Manual: `POST /api/admin/sync/{slug}/preview` y `.../apply` desde la UI única.

## UI única (Fase 3)
`/admin/sync` — selector de fuente (cards Crestron/Sonance/Excel) → Preview (tabla diff:
matched/nuevos, cambios de precio/stock) → Apply. Reemplaza conceptualmente crestron-sync
y las 19 pantallas de sonance-import (que quedan accesibles hasta deprecar).

## Orden de ejecución (cada bloque: build verde antes de seguir)
- A: migración Prisma (SyncRun/SyncStagedProduct)
- B: types + http + upsert + registry + connectors
- C: pipeline (preview/applyBatch)
- D: endpoints admin + cron + vercel.json
- E: UI /admin/sync
- F: verificación integral (build + dry-run preview real de cada fuente)

## No romper
- No borrar endpoints ni servicios viejos en esta fase.
- No desactivar productos automáticamente.
- No cambiar match keys.
- Toda escritura respeta la regla de oro.
