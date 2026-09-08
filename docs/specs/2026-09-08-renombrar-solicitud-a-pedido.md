# Spec — Renombrar "Solicitud" → "Pedido" en toda la plataforma

Pedido del usuario: *"Quiero que le cambies el nombre de solicitud porque es raro (en todo el sistema); buscá una palabra más acorde, órdenes de compra por ejemplo aunque no es una orden de compra."*

Decisión: **"Pedido"**. Motivos: es la palabra natural en el B2B argentino ("armar un pedido", "mis pedidos", "pasame el pedido"), no promete una orden de compra firme (eso sería "Orden de compra"), convive bien con "Cotización" (el pedido es lo que manda el cliente; la cotización es lo que responde Soundtec) y ya se usaba en el nav inferior del portal ("Pedidos").

## Alcance

Solo **textos visibles** (UI, emails, PDFs, mensajes de error, ayuda/tutoriales, changelog nuevo). **No** renombrar modelos Prisma, enums, rutas, identificadores de código, claves de permisos ni nombres de archivo (`CustomerRequest`, `/portal/requests`, `requests.manage`, etc. quedan igual).

Reemplazos (respetando género y número; "solicitud" es femenino, "pedido" es masculino → revisar artículos y adjetivos en cada frase, no hacer replace ciego):

| Antes | Después |
|---|---|
| Solicitud / solicitud | Pedido / pedido |
| Solicitudes / solicitudes | Pedidos / pedidos |
| Mi solicitud en armado | Mi pedido en armado |
| Nueva solicitud vacía | Nuevo pedido vacío |
| Solicitud #ABC123 | Pedido #ABC123 |
| Solicitudes abiertas | Pedidos abiertos |
| Últimas solicitudes | Últimos pedidos |
| Agregar a mi solicitud | Agregar a mi pedido |
| Enviar solicitud | Enviar pedido |
| Tu solicitud ya llegó… Vamos a revisarla | Tu pedido ya llegó… Vamos a revisarlo |
| Generar cotización desde esta solicitud | Generar cotización desde este pedido |
| Generada desde la solicitud #X | Generada desde el pedido #X |
| No avanzamos con esta solicitud | No avanzamos con este pedido |
| Solicitud de presupuesto / de cotización | Pedido de cotización |
| Admin · Solicitudes | Admin · Pedidos |

Excepciones que **no** se tocan: "Solicitud de acceso" (landing / login, es otro concepto), `solicitud` dentro de prompts de IA en `src/services/openai.ts` y `src/components/admin/ai-prompts-form.tsx` **sí** se cambian (para que la IA responda con el término nuevo), y los ids de changelog viejos no se editan (solo se agrega una entrada nueva).

## Archivos (según relevamiento, 47 archivos)

Recorrer con `grep -rni "solicitud" src --include=*.ts --include=*.tsx -l` y editar cada uno. Prestar atención a: `src/lib/request-status.ts` (labels y hints), `src/lib/help/*.ts` (tutoriales/tours), `src/components/portal/*`, `src/app/portal/**`, `src/app/admin/requests/**`, `src/app/admin/clients/**` (ya reescrito por el módulo CRM; editar el texto nuevo), `src/components/layout/portal-shell.tsx` ("Mis pedidos"), `src/components/layout/admin-sidebar-nav.tsx` ("Pedidos"), `src/app/admin/page.tsx`, `src/server/actions/requests.ts` y `quotes.ts` (strings de mensajes), `src/services/quote-orchestrator.ts`, `src/data/admin-changelog.ts` (solo entrada nueva), `src/app/page.tsx` y `src/components/landing/**` (ya dicen "pedido" en la mayoría; unificar).

Metadata `title` de páginas: `Pedidos`, `Pedido #…`.

## Verificación

- `grep -rni "solicitud" src --include=*.tsx --include=*.ts` debe devolver solo las excepciones listadas (acceso) y comentarios de código si los hay.
- `npx tsc --noEmit` en verde.
- Changelog: versión 1.14.0, id `ship-2026-09-08-6`: "Las solicitudes pasan a llamarse Pedidos en todo el sistema (portal y admin)".
