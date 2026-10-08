# Room Builder — fundación iniciada (sin tokens / sin prod)

**Fecha:** 2026-10-08  
**Estado:** base de código en el repo; **no** requiere Vercel token ni DB de producción para validar esta capa.

## Qué se construyó (seguro / no frágil)

| Pieza | Ubicación | Depende de prod? |
| --- | --- | --- |
| Schema `ProductDesignProfile`, `RoomProject`, `RoomProjectDevice` | `prisma/schema.prisma` | No para editarlo; `db push` sí necesita DB al desplegar |
| Tipologías máximas (templates + slots + presets cámara) | `src/services/room-builder/templates.ts` | No |
| Cobertura (límites de override, fit cámara/mic/display) | `src/services/room-builder/coverage.ts` | No |
| Ranking hard-filter + score | `src/services/room-builder/ranking.ts` | No |
| Draft de perfil desde datos **ya** en Product (sin red) | `src/services/room-builder/from-product.ts` | No |
| Tests unitarios | `src/services/room-builder/*.test.ts` | No |

## Qué NO se hizo a propósito

- UI admin / viewport 3D (aún no; evita pantalla “a medias”)  
- Connector Serper/OpenAI / scrape de sitios  
- Escritura a catálogo de producción  
- Changelog admin (no hay UI visible todavía)

## Cómo validar sin keys

```bash
npm test
# o solo room-builder:
npx tsx --test src/services/room-builder/*.test.ts
```

## Siguiente capa (cuando haya `VERCEL_TOKEN` o `DATABASE_URL`)

1. `prisma db push` en el entorno con DB  
2. Inventario read-only: % con `vendorProductUrl` / `documents` / specs  
3. Persistencia de drafts → `ProductDesignProfile`  
4. Enrich oficial-first (URL del producto)  
5. UI interna + 3D multi-vista + Quote bridge  
