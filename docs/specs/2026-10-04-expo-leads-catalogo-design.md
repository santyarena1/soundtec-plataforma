# Experiencia Expo: leads por QR, catálogo por marcas y solicitud de cuenta

Fecha: 2026-10-04 · Estado: aprobado por el usuario · Proyecto 1 de 2 (el 2 es la landing 3D)

## Objetivo

Usar la plataforma en una exposición para captar leads desde el celular. Quien escanea un QR
deja al menos su mail, explora el catálogo (sin precios) empezando por las marcas y tiene a la
vista, todo el tiempo, el pedido de cuenta de cliente. El admin crea eventos y QR, muestra el QR
en un televisor del stand y mide resultados.

Todo se diseña mobile-first, con el estilo visual actual de la plataforma ("A · limpia y clara")
y el logo oficial de Soundtec (`/landing/logo_soundtec.png`), nunca la "S" de reemplazo.

## Fuera de alcance (va después)

- Filtro por defecto que oculte accesorios, partes y configuraciones: el catálogo muestra todo
  como hoy. La marca Principal/Accesorio actual no es confiable (ej. DSP 2-150 MKIII figura como
  accesorio) y se revisa en otro proyecto.
- Envío real de mails con Resend: queda preparado, se activa cuando se cargue la API key.
- Landing 3D (proyecto 2).

## 1. Datos

Modelos nuevos en Prisma:

| Modelo | Campos clave |
|---|---|
| `ExpoEvent` | `name`, `startsAt`, `endsAt`, `displayOrientation` (`AUTO`/`LANDSCAPE`/`PORTRAIT`), timestamps. El estado (PROGRAMADO / VIGENTE / TERMINADO) se deriva de las fechas, no se guarda. |
| `ExpoQr` | `eventId`, `label` (ej. "Televisor del stand"), `code` corto único (6–8 caracteres, URL-safe), `isActive`. |
| `ExpoVisit` | `qrId?`, `visitorId` (id anónimo en cookie), `type` (`SCAN` / `BRAND_VIEW` / `LEAD` / `ACCOUNT_REQUEST`), `brandId?`, `createdAt`. Fuente de todos los reportes. |
| `VisitorLead` | `email` (obligatorio), `name?`, `company?`, `phone?`, `interest?`, `visitorId`, `eventId?`, `qrId?`, `source` (`QR` / `WEB`), timestamps. |
| `AccountRequest` | `fullName`, `email`, `phone`, `company`, `cuit`, `location?`, `activity` (opción del desplegable), `activityOther?`, `website?`, `comment?`, `status` (`PENDING` / `APPROVED` / `REJECTED`), `rejectionReason?`, `leadId?`, `qrId?`, `reviewedById?`, `reviewedAt?`, `createdClientId?`, `createdUserId?`. |
| `AccountActivationToken` | `userId`, `tokenHash` (nunca el token en claro), `expiresAt` (72 h), `usedAt?`. |

`ExpoLead` (leads del asistente IA) no se toca; los reportes del evento leen `VisitorLead`.

## 2. Recorrido del QR y bienvenida

- Cada QR apunta a `/e/<code>`. Esa ruta registra `SCAN`, guarda en cookies el `visitorId`
  (si no existe) y el `qrId`, y redirige a `/catalogo`.
- **Regla de la bienvenida** (función pura, testeada):
  - Si ya dejó datos (cookie de lead) → no se muestra.
  - Si vino de un QR cuyo evento está VIGENTE → obligatoria (sin "Saltear").
  - Si no → se muestra una sola vez con un "Saltear" chico; al saltear no vuelve a aparecer.
- Bienvenida: mail obligatorio; nombre, empresa, teléfono y "¿Qué te interesa?" opcionales.
  Texto chico pero visible: "No hacemos spam. Usamos tus datos solo para responder tu consulta."
- Al enviar: crea `VisitorLead`, registra `LEAD`, guarda cookie de lead y entra al catálogo.

## 3. Catálogo y fichas

- `/catalogo` sin filtros ni búsqueda muestra la **grilla de marcas** (logo, nombre y cantidad de
  productos) con **"Ver todos los productos"** arriba. Elegir una marca o "Ver todos" lleva al
  listado actual.
- Listado: **barra superior de marcas** deslizable (chips con logo) para cambiar de marca.
  Cada filtro por marca registra `BRAND_VIEW`.
- **"Solicitar cuenta de cliente"** para quien no tiene sesión:
  - catálogo: botón fijo abajo en celular, franja visible en PC;
  - ficha: bloque destacado "Precio para clientes" donde iría el precio.
- **Orden de la ficha** en `/catalogo/[id]` y `/portal/products/[id]`, PC y celular:
  fotos → nombre/marca y bloque de precio o CTA → **descripción** → especificaciones técnicas,
  documentos, accesorios y el resto.
- Logos de marca: `Brand.logoUrl`, editable en Admin → Marcas. Sin logo → nombre tipografiado.

## 4. Solicitar cuenta

- Página `/solicitar-cuenta`, precargada con el `VisitorLead` del visitante si existe.
- Campos y obligatoriedad:
  - Obligatorios: nombre y apellido, mail, teléfono/WhatsApp, empresa, **CUIT** (validación de
    dígito verificador), "Actividad de la empresa".
  - Opcionales: provincia/ciudad, web o Instagram, comentario.
  - "Actividad de la empresa" es un desplegable: Integración AV / Instalaciones eléctricas /
    Arquitectura y diseño / Constructora o desarrolladora / Venta de equipos / Otra. Con "Otra"
    aparece un campo de texto obligatorio.
- Validación con zod en servidor, honeypot y límite de envíos por IP y por mail.
- Admin → "Solicitudes de cuenta": bandeja con contador de pendientes en el menú.
  - **Aprobar**: crea `Client` y `User` (rol cliente, sin contraseña), genera
    `AccountActivationToken` y muestra el link `/activar/<token>` con botones Copiar y Enviar por
    WhatsApp.
  - **Rechazar**: pide motivo y lo guarda.
- `/activar/<token>`: la persona define su contraseña; el token se marca usado. Vencido o usado →
  mensaje claro y contacto.
- **Mails preparados**: módulo `mailer` con `sendMail()`. Sin `RESEND_API_KEY` no envía y deja
  registro; con la key manda el aviso de nueva solicitud a los destinatarios configurados
  (`AdminSetting`) y el link de activación al cliente. Sin cambios de código para activarlo.

## 5. Admin: Eventos y QR

Configuración → "Eventos y QR":

- CRUD de eventos (nombre, fechas, orientación de pantalla) y de sus QR.
- Por QR: **Descargar PNG** (alta resolución, para imprimir) y **Abrir pantalla**.
- **Pantalla del stand** `/expo/pantalla/<code>`: pantalla completa, sin menús, logo oficial,
  "Escaneá y explorá todo el catálogo", QR grande y fila de marcas. Orientación automática según
  el monitor u horizontal/vertical forzada desde el evento.
- **Reportes** por evento y por QR: escaneos, leads (y % sobre escaneos), cuentas pedidas,
  marcas más vistas. Descarga de leads en Excel.

## 6. Errores y seguridad

- Formularios públicos: validación en servidor, honeypot, rate limit, mensajes claros en español.
- Los tokens de activación se guardan hasheados y son de un solo uso.
- El catálogo público nunca expone precios ni stock.
- Fallos de registro de visitas no rompen la navegación (se registran en log).

## 7. Pruebas

- Unitarias: validación de CUIT, regla de la bienvenida, agregaciones de reportes,
  generación/validación del token de activación, código de QR.
- Prueba de punta a punta en tamaño celular (escanear → bienvenida → marcas → ficha →
  solicitar cuenta → aprobar → activar) antes de subir.
- Revisión de código y de seguridad.
