# Room Builder — acceso a producción desde el Cloud Agent

**Fecha:** 2026-10-08  
**Estado:** bloqueado en **esta** VM hasta inyectar secretos del environment

## Qué asumía el negocio

Que DB y keys “ya están en el proyecto” (Vercel / admin / prod).

## Qué hay en esta VM del Cloud Agent (comprobado)

| Recurso | Estado aquí |
| --- | --- |
| `/workspace/.env` | **No existe** (solo `.env.example`) |
| `DATABASE_URL` en el entorno del proceso | **No inyectada** |
| `OPENAI_API_KEY` / `SERPER_API_KEY` en env | **No inyectadas** |
| Vercel CLI logueado | **No** |
| GitHub Actions secrets legibles | **No** (403) |
| Keys en `AdminSetting` (prod) | Requieren **conexión a la DB de prod** primero |

Conclusión: en producción las keys pueden estar en Vercel y/o en `/admin` → `AdminSetting`, pero **este agente no las ve** hasta que el **Cursor Environment** tenga los secretos (o un `.env` provisionado en el build).

## Qué hay que agregar al Cloud Agent Environment

Mínimo para inventariar + construir enrich:

1. `DATABASE_URL` — Postgres de producción (o réplica read-only si prefieren seguridad).  
2. Opcional si no están solo en AdminSetting: `OPENAI_API_KEY` (modelo fuerte + el de extract).  
3. `SERPER_API_KEY` — solo respaldo; no fuente de verdad.  
4. `AUTH_SECRET` — si hace falta levantar la app localmente.  
5. `BLOB_READ_WRITE_TOKEN` — si se van a guardar PDFs/renders en Blob.

Dónde: dashboard del environment del Cloud Agent → Secrets  
URL del environment de este run:  
https://cursor.com/dashboard/cloud-agents/environments/e/89841f1a-a96c-11f1-b532-320a589b8025

Después de cargarlos, **un agente nuevo** (o rebuild) los recibe; la VM actual no se retroalimenta sola.

## Uso seguro de prod

- Primer paso: **solo lectura** (conteos, % con `vendorProductUrl` / `documents` / specs).  
- Escritura de `ProductDesignProfile`: preferible con preview/apply y, si es posible, ventana controlada; no pisar precio/stock.  
- No correr seed contra prod.

## Cuando esté el acceso

1. Relevamiento SQL del catálogo (links oficiales, docs, dims).  
2. Implementación enrich oficial-first.  
3. Builder interno según decisiones cerradas.
