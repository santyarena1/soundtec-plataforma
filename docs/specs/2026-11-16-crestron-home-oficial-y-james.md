# Crestron Home según la lista oficial · Catálogo JAMES desde la cuenta 5580105J

Pedidos del Gerente Comercial (2026-11-16).

## 1. "Compatible con Crestron Home" = lista oficial

- Fuente: <https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Works-with-Crestron-Home.htm>
- Categorías consideradas: Audio, Climate Control, Control Systems, Gateways and Expanders, I/O Devices, Keypads,
  Lighting, Power Control, Remotes, Sensors, Shading, Touch Screens, Video. Fuera: Cameras, Crestron Drivers, Pools,
  Security and Door Locks.
- Solo renglones con link a crestron.com (sin link = otra marca). Se ignoran las secciones "Unsupported".
- Variantes: se compara el modelo sin los segmentos finales de color/terminación/presentación (-B, -W, -A, -G, -T, -S,
  -BRZ, -GLASS, -BR-BRASS, -DRK-NKL, -EACH…) y sin ENGRAVED/BLANK/KIT. Los sufijos funcionales (-I, -NC, -R, -P, -E,
  -AW, -1G, -C) son otros modelos. Si el link es `crestron.com/model/NNNNNNN`, también coincide por material number.
- Lista guardada: `src/data/crestron-home-official.json` (fecha de lectura y URL de cada categoría).
- Código: `src/services/crestron-home/` (parser, comparación, plan/aplicación). Tests en `match.test.ts`.

Comandos:

```bash
# Regenerar la lista desde docs.crestron.com (13 páginas, con pausa)
npx tsx scripts/crestron-home-official-fetch.ts

# Ver cambios (dry-run, no escribe) y guardar el JSON antes/después
ENV_FILE=.env.devbranch npx tsx scripts/crestron-home-apply.ts --out=/ruta/crestron-home-cambios.json
# Aplicar (idempotente)
ENV_FILE=.env.devbranch npx tsx scripts/crestron-home-apply.ts --apply
```

Producción: el mismo script con `ENV_FILE=.env.prod` (branch de backup en Neon antes), o el botón
**Admin → Crestron Home → "Marcar según lista oficial"** (usa el mismo cálculo). Ningún sync (Xtrabone, crestron-web)
escribe el campo; la marca manual por producto sigue existiendo pero el próximo "Marcar según lista oficial" la pisa.

## 2. JAMES desde my.sonance.com

- El usuario del portal tiene dos cuentas de facturación: 5580105 (habitual, queda al iniciar sesión) y **5580105J**
  (James). El catálogo y el My Price de James solo salen bien en la cuenta James (en la habitual se ve un subconjunto y
  el precio de lista).
- Selección de cuenta (`src/services/sonance-portal.ts`): `listPortalAccounts` (GET `/api/v1/billtos?expand=shiptos`)
  y `selectPortalAccount` (PATCH `/api/v1/sessions/current` con `billTo`/`shipTo`, lo mismo que el selector de cuenta
  de la web; verifica con GET `/api/v1/sessions/current`). `openSession({ account })`; sin cuenta, todo igual que antes.
- El conector `sonance` suma los productos de la categoría `pn-james` con marca JAMES en el listado, pedidos en la cuenta
  James (detalle + My Price por `realtimepricing`), y los pisa por SKU. Los accesorios Sonance que esa categoría también
  lista siguen saliendo de la cuenta habitual.
- Se activa con el setting `sonance.james_account` = `5580105J` (vacío = no usa la cuenta James).
  `SONANCE_ONLY_BRAND=JAMES` limita una corrida a James (lo usa el script).

Importación puntual (mismo camino: conector → pipeline → upsert por supplierSku):

```bash
ENV_FILE=.env.devbranch npx tsx scripts/sonance-james-import.ts           # preview
ENV_FILE=.env.devbranch npx tsx scripts/sonance-james-import.ts --apply   # aplica
```

Producción (propuesta, no activado): correr el script con `ENV_FILE=.env.prod` tras un backup, y cargar el setting
`sonance.james_account = 5580105J` para que el sync semanal de Sonance incluya James desde entonces. Sin el setting el
sync semanal se comporta como antes.
