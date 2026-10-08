# Room Builder — bridge de catálogo (sin revelar DATABASE_URL)

## Problema

Vercel marca `DATABASE_URL` como **Sensitive/Secret**: no se puede revelar en el dashboard ni bajarla con `vercel env pull`. El agente Cloud no puede abrir Postgres directo desde el VM.

## Solución

Endpoint **read-only** que corre **en Vercel** (donde sí existe `DATABASE_URL`) y expone inventario del catálogo para el Room Builder.

- Ruta: `GET /api/internal/room-builder/catalog`
- Auth: `Authorization: Bearer <ROOM_BUILDER_BRIDGE_SECRET>`
- Fallback de auth (si no hay secret dedicado): `SETUP_TOKEN` o `CRON_SECRET`
- No acepta SQL arbitrario. No escribe. No devuelve la connection string.

## Vistas

| `view` | Uso |
| --- | --- |
| `summary` | Totales, cobertura de specs/docs/AI, top marcas |
| `brands` | Lista de marcas con conteo |
| `types` | `productType` y mounts del `ProductAiProfile` |
| `products` | Página de productos (filtros `brand`, `q`, `productType`, `hasSpecs`, `hasDocs`, `hasAi`, `hasVendorUrl`) |
| `product` | Detalle de un SKU (`id=`) con specs, docs, AI profile e imágenes |

## Env

```bash
ROOM_BUILDER_BRIDGE_SECRET=<token aleatorio largo>
```

Configurar en Vercel para **Preview** y **Production**. Preferible `--no-sensitive` solo si hace falta re-leer el valor; en uso normal puede ser Secret.

## Ejemplo

```bash
curl -sS \
  -H "Authorization: Bearer $ROOM_BUILDER_BRIDGE_SECRET" \
  "https://<host>/api/internal/room-builder/catalog?view=summary"
```

## Retiro

Cuando el Room Builder ya no necesite este puente (acceso local a DB o pipeline de enrich propio), borrar la ruta y la env var.
