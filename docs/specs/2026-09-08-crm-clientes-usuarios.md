# Spec — CRM de clientes + gestión de usuarios (rehacer desde cero la UX)

Pedido del usuario:
- *"Un módulo para poder crear clientes y gestionarlos tipo CRM ya que tenemos información de ellos cuando tengamos un usuario de cada uno, pero no tiene que ser obligatorio porque sino no voy a poder hacer cotizaciones a clientes que no tengan usuario."*
- *"Mejorar y hacer de 0 la gestión de usuarios y clientes en la plataforma, tiene que ser mucho más claro e intuitivo para un usuario promedio."*

Conceptos (mantener los modelos existentes, agregar lo que falta):
- **Cliente** (`Client`) = empresa/cuenta comercial. Puede existir sin usuarios. Es a quien se cotiza.
- **Usuario** (`User`) = persona que entra al sistema. Si `role = CLIENT`, pertenece a un Cliente (`clientId`). Admins no tienen cliente.

## 1. Schema (`prisma/schema.prisma`) — cambios aditivos

```prisma
model Client {
  // … existentes …
  website        String?
  city           String?
  province       String?
  country        String?   @default("Argentina")
  segment        String?   // ej. "Integrador", "Corporativo", "Educación", "Residencial", "Gobierno", "Rental"
  source         String?   // cómo llegó: "Referido", "Web", "Evento", "Cartera"
  ownerId        String?   // vendedor/responsable interno (User admin)
  owner          User?     @relation("ClientOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  tags           String[]  @default([])
  lastActivityAt DateTime?
  contacts       ClientContact[]
  activities     ClientActivity[]
}

model ClientContact {
  id        String   @id @default(cuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  name      String
  role      String?      // cargo
  email     String?
  phone     String?
  whatsapp  String?
  isPrimary Boolean  @default(false)
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([clientId])
}

enum ClientActivityKind { NOTE CALL MEETING EMAIL WHATSAPP TASK SYSTEM }

model ClientActivity {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  kind        ClientActivityKind @default(NOTE)
  title       String
  body        String?
  dueAt       DateTime?      // para TASK
  doneAt      DateTime?
  createdById String?
  createdBy   User?    @relation("ClientActivityAuthor", fields: [createdById], references: [id], onDelete: SetNull)
  referenceType String?     // "REQUEST" | "QUOTE" | "MOVEMENT"
  referenceId   String?
  createdAt   DateTime @default(now())
  @@index([clientId, createdAt])
}
```

Agregar en `User`: `ownedClients Client[] @relation("ClientOwner")`, `clientActivities ClientActivity[] @relation("ClientActivityAuthor")`.

Migrar el dato existente: al primer render del detalle, si el cliente tiene `contactName/email/phone` y no tiene contactos, crear un `ClientContact` primario con esos datos (hacerlo en una server action idempotente `ensurePrimaryContact(clientId)` que se llama desde la página de detalle). No borrar los campos viejos del modelo.

Eventos automáticos (`SYSTEM`): cuando se crea una CustomerRequest, un Quote o un AccountMovement para un cliente, crear una ClientActivity `SYSTEM` con `referenceType/referenceId` y actualizar `Client.lastActivityAt`. Hacerlo con un helper `logClientActivity(...)` en `src/server/crm/activity.ts` y llamarlo desde `src/server/actions/requests.ts`, `src/server/actions/quotes.ts` y `src/server/actions/admin-client-detail.ts` (mínimo cambio: una línea después de cada create).

## 2. Páginas admin — Clientes (`/admin/clients`) — rehacer

### Lista `/admin/clients`
- Buscador (empresa, nombre de fantasía, CUIT, contacto, email), filtros: estado (activo/inactivo), segmento, responsable, "sin usuarios de portal", "sin actividad hace más de 30/90 días".
- Tabla: Empresa (+ nombre fantasía), Contacto principal, Segmento, Responsable, Usuarios del portal (n), Solicitudes (n), Última actividad, Estado. Orden por última actividad desc por defecto. Paginación 25/50.
- Botón primario **"Nuevo cliente"** → modal (`Modal` de `src/components/ui/dialog.tsx`) con formulario en 2 pasos visuales dentro del mismo modal: (1) Empresa: razón social*, nombre de fantasía, CUIT, segmento, responsable; (2) Contacto principal (opcional): nombre, cargo, email, teléfono/WhatsApp. Checkbox "Crear también un usuario del portal para este contacto" (desmarcado por defecto): si se marca, pide contraseña inicial (o "generar y mostrar") y crea el User con `role CLIENT` y `clientId`. Al guardar, redirigir a la ficha.
- Tarjetas resumen arriba: total clientes activos, con usuarios de portal, con solicitudes abiertas, sin actividad >90 días.

### Ficha `/admin/clients/[id]` — rehacer con layout de CRM
- Header: nombre, badges (segmento, activo/inactivo, tags), responsable, botones: "Nueva cotización" (link a `/admin/quotes/new?clientId=`), "Nueva actividad", "Editar".
- Columna izquierda (sticky): datos de empresa (editable inline vía modal), contactos (lista + agregar/editar/borrar + marcar principal + botón "Crear usuario del portal" por contacto), usuarios del portal (nombre, email, último acceso, activo; acciones: activar/desactivar, resetear contraseña = generar temporal y mostrar una vez).
- Columna derecha con **tabs sincronizadas a la URL** (`?tab=`): 
  - **Actividad** (default): timeline de `ClientActivity` (más nuevo arriba) mezclando notas/llamadas/tareas y eventos del sistema; formulario rápido arriba (tipo, título, detalle, fecha de vencimiento si es tarea). Tareas pendientes destacadas.
  - **Solicitudes**: las CustomerRequest del cliente (todas, no sólo del usuario), estado, ítems, link.
  - **Cotizaciones**: Quotes del cliente (número, versión, estado, fecha, total si existe), link.
  - **Cuenta corriente**: lo que existe hoy (`AccountMovement`) + saldo, exponer `notes` y `referenceType/referenceId` (select "Vincular a cotización N°").
  - **Precios y visibilidad**: reusar `PricingRulesWorkspace` (descuentos) y `VisibilityRulesWorkspace` como hoy, en sub-tabs.
- Eliminar el tab "comercial" duplicado; `assignedPriceListId` pasa a ser un campo más del modal "Editar empresa" (etiquetado "Lista de precios de referencia", con hint de que el precio real sale de reglas).
- **No cargar 4000 productos** en el render: para los labels de reglas usar una consulta sólo de los `scopeId` presentes en las reglas del cliente.

### Server actions — unificar en `src/server/actions/clients.ts`
Una sola fuente: `createClient`, `updateClient`, `toggleClientActive`, `upsertClientContact`, `deleteClientContact`, `setPrimaryContact`, `createClientActivity`, `completeClientActivity`, `deleteClientActivity`, `createPortalUserForClient`, `resetPortalUserPassword`, `togglePortalUserActive`. Todas devuelven `{ ok: boolean; error?: string; id?: string }` y **nunca fallan en silencio** (validar con zod y devolver el mensaje; en los formularios mostrar `FieldError`). Borrar `src/server/actions/admin-client-detail.ts` migrando lo que sirva. Mantener `resolveCommercialClientId` intacto.

## 3. Páginas admin — Usuarios (`/admin/users`) — rehacer

- Lista con buscador, filtros por rol y estado, y tabla: Nombre, Email, Rol (badge), Cliente (link a ficha, o "— sin cliente —" con badge de advertencia si role=CLIENT), Último acceso, Estado.
- "Nuevo usuario" → modal con **un solo formulario claro**: Nombre*, Email*, Tipo de usuario (radio grande con descripción): "Cliente del portal" / "Administrador" / "Super admin" (solo si el actual es SUPER_ADMIN). Si "Cliente del portal": selector buscable de Cliente (`SearchablePick`) obligatorio + link "crear cliente nuevo" (abre el modal de cliente y vuelve con el id). Contraseña: "generar automáticamente y mostrar" (default) o escribir. Rol personalizado (`customRoleId`) en un acordeón "Permisos avanzados".
- Ficha `/admin/users/[id]`: mismos campos + firma para cotizaciones (`quoteSignName`, `quoteSignTitle`) + acciones: resetear contraseña, activar/desactivar, y **eliminar** sólo si no tiene requests/quotes (si tiene, ofrecer desactivar).
- Unificar las 3 acciones existentes (`createPortalUser`, `upsertUser`, `updateUserFull`) en `src/server/actions/users.ts`: `createUser`, `updateUser`, `resetUserPassword`, `toggleUserActive`, `deleteUser`. Mismo contrato `{ok,error}`. Actualizar todos los callers. Guardar el error de escalación de rol como error visible, no como `return` silencioso.
- Sincronizar `User.companyName` con `client.companyName` al vincular un usuario a un cliente (escribir `companyName` del cliente en el user).

## 4. Componentes

- Crear `src/components/admin/client-form-modal.tsx`, `contact-form-modal.tsx`, `activity-form.tsx`, `activity-timeline.tsx`, `user-form-modal.tsx`, `password-reveal.tsx` (muestra una contraseña generada una sola vez con botón copiar).
- Usar el design system existente (`src/components/ui/*`, `SearchablePick`). Nada de librerías nuevas.
- Mantener archivos < 400 líneas; separar en subcomponentes.

## 5. Verificación

- `npx prisma generate` y `npx tsc --noEmit` en verde. **No** correr `prisma db push` ni `next build` (no hay DB local).
- Actualizar `docs/` con un `crm-clientes.md` corto explicando el modelo y flujos.
- Entrada en `src/data/admin-changelog.ts`: versión 1.13.0, id `ship-2026-09-08-3`.
- No tocar: `src/app/admin/sync/**`, `src/app/admin/imports/**`, `src/app/admin/margins/**`, `src/app/admin/discounts/**`, `src/app/portal/**`, `src/services/**`.
