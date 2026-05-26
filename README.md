# Soundtec — Plataforma B2B

Portal privado para clientes y panel administrativo de **Soundtec S.R.L.**
(soluciones profesionales de audio, video, iluminación, videoconferencia,
automatización y control inteligente).

> Esta es la **Fase 1** funcional. La arquitectura, el schema y los servicios
> ya están preparados para Fase 2 (IA real, scrapers reales, edición masiva
> avanzada) y Fase 3 (stock real, comparativa entre proveedores, notificaciones,
> ERP).

---

## 1. Stack

- **Next.js 14** (App Router) + **TypeScript estricto**
- **Tailwind CSS** + componentes estilo shadcn/ui escritos a medida
- **Prisma ORM** + **PostgreSQL** (Neon / Supabase / Render compatible)
- **Auth.js v5 (NextAuth)** con credenciales + bcrypt + JWT
- **Zod** para validación, **React Hook Form** disponible para formularios complejos
- **TanStack Table** disponible para tablas
- **xlsx (SheetJS)** para importación de Excel
- **OpenAI SDK** y cliente **Serper** preparados como servicios desacoplados
- Deploy en **Vercel** (frontend + server actions) y **Neon/Supabase/Render** (Postgres)

## 2. Estructura

```
src/
  app/
    (landing pública)
    login/
    portal/                # cliente (catálogo, favoritos, listas, solicitudes)
    admin/                 # admin: usuarios, productos, importaciones, ...
  components/
    ui/                    # Button, Card, Input, Table, Badge, etc
    layout/                # PublicNavbar, PortalShell, AdminShell, etc
  lib/
    prisma.ts, auth.ts, auth-helpers.ts
    pricing.ts             # motor central de precios
    catalog.ts             # consulta + visibilidad + cálculo de precio
    settings.ts
    utils.ts
  server/actions/          # server actions (todas marcadas "use server")
  services/
    openai.ts              # mapeo de columnas, descripciones, sugerencias
    serper.ts              # imágenes y búsqueda web
    excel.ts               # parser y mapeo canónico
  scrapers/                # interfaz Scraper + scraper mock; agregá los reales acá
prisma/
  schema.prisma            # modelo completo (todas las fases)
  seed.ts                  # admin + cliente demo + datos ejemplo
```

## 3. Instalación local

Requiere **Node 20+** y un **PostgreSQL** accesible.

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env
# Editar .env con DATABASE_URL, AUTH_SECRET, etc.

# 3. Crear el schema en la DB
npm run db:push

# 4. Cargar datos iniciales (admin + cliente demo + categorías + producto demo)
npm run db:seed

# 5. Levantar el dev server
npm run dev
```

Por defecto el seed crea:

- **Super admin**: `admin@soundtec.com.ar` / clave definida en `SEED_ADMIN_PASSWORD` (default: `Soundtec!2026`)
- **Cliente demo**: `cliente.demo@soundtec.com.ar` / `Cliente!2026`

Cambialos en `.env` antes del primer seed (o más tarde desde `/admin/users`).

## 4. Variables de entorno

```env
DATABASE_URL="postgresql://..."          # Neon, Supabase, Render o local
AUTH_SECRET="..."                        # openssl rand -base64 32
AUTH_TRUST_HOST="true"
NEXTAUTH_URL="http://localhost:3000"

# Seed
SEED_ADMIN_EMAIL="admin@soundtec.com.ar"
SEED_ADMIN_PASSWORD="cambiar"
SEED_ADMIN_NAME="Administrador Soundtec"

# IA (si están vacías, los servicios devuelven mocks razonables)
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"
SERPER_API_KEY=""

# Branding y defaults
APP_NAME="Soundtec"
APP_URL="http://localhost:3000"
DEFAULT_CURRENCY="USD"
DEFAULT_GLOBAL_MARGIN_PERCENT="35"
```

Las claves OpenAI/Serper **también pueden cargarse desde `/admin/api-keys`**
(quedan guardadas en `AdminSetting` marcadas como secretas). En producción
es preferible usar `.env` y dejar la UI sólo para overrides o rotación rápida.

## 5. Migraciones y DB

```bash
# Desarrollo (prototipo): aplicar schema sin migration files
npm run db:push

# Producción (con historial de migraciones):
npm run db:migrate -- --name init

# Regenerar el cliente Prisma
npm run db:generate

# Estudio visual
npm run db:studio
```

### Proveedores de PostgreSQL recomendados

| Proveedor | Cuándo usarlo |
|-----------|---------------|
| **Neon**  | Default. Serverless, ramas, plan gratuito generoso. |
| **Supabase** | Si querés auth/storage/realtime extras. |
| **Render** | Si vas a correr workers persistentes para scraping o jobs. |

Si necesitás workers persistentes (cron de scraping, procesamiento de Excels
grandes en background) lo más recomendable es desplegarlos como **Worker
service** en Render apuntando al mismo Postgres que usa Vercel.

## 6. Crear el primer admin

El seed (`npm run db:seed`) lo crea automáticamente. Si querés crear uno
adicional:

```ts
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash("clave-super-segura", 12);
await prisma.user.create({
  data: {
    email: "admin2@soundtec.com.ar",
    name: "Admin 2",
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    isActive: true,
  },
});
```

O bien desde `/admin/users` con un usuario SUPER_ADMIN.

## 7. Deploy a Vercel + GitHub

```bash
# 1. Inicializá git y subí a GitHub
git init
git add .
git commit -m "feat: Soundtec plataforma fase 1"
git branch -M main
git remote add origin <tu-repo>
git push -u origin main

# 2. En Vercel:
#    - Import Project → seleccioná el repo
#    - Framework: Next.js
#    - Variables de entorno: DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL, etc.
#    - Build command: npm run build  (ya corre prisma generate)
#    - Output: .next

# 3. Después del primer deploy, contra el Postgres remoto:
DATABASE_URL="postgresql://..." npm run db:push
DATABASE_URL="postgresql://..." npm run db:seed
```

> El middleware Edge protege `/portal/*` y `/admin/*`. Vercel ya soporta este
> middleware nativo. No hace falta configuración adicional.

## 8. Qué quedó implementado (Fase 1)

### Público / Landing
- Landing pública editable desde `/admin/landing` (hero + posts + marcas).
- Página de login con sesiones JWT y middleware de protección por rol.
- SEO básico, metadata, branding tipográfico.

### Portal cliente
- Dashboard con KPIs personales.
- Catálogo con búsqueda, filtros por marca/distribuidor/categoría/familia/stock/descuento/favoritos.
- Ordenamiento y dos vistas (tarjetas / tabla).
- Página individual de producto con galería, descripción corta/larga, descuentos, badge IA + feedback.
- Favoritos y listas propias.
- Solicitudes (cotización / pedido / consulta) con ítems, mensajes y respuestas del admin.
- Aviso de contenido IA + feedback con tres niveles (correcto / errores / comentario libre).

### Admin
- Sidebar profesional con módulos:
  Dashboard · Solicitudes · Productos · Marcas · Distribuidores · Categorías ·
  Importaciones Excel · Mapeos · Scrapers · Márgenes · Descuentos ·
  Visibilidad · Usuarios · Landing · IA y feedback · Configuración ·
  Branding · API Keys · Tickets al desarrollador.
- CRUD completo de marcas, distribuidores, categorías, productos y usuarios.
- Edición masiva de productos (activar/desactivar/cambiar marca/categoría/familia/descuento).
- Importación de Excel: subida, detección de columnas, sugerencia heurística/IA de mapeo, edición del mapeo, guardado como perfil reutilizable, vista previa, aprobación masiva e upsert al modelo canónico.
- Reglas de **margen** con prioridad documentada (cliente+producto > cliente+marca > … > global).
- Reglas de **descuento** con prioridad clara.
- Reglas de **visibilidad por cliente** (ocultar o permitir explícitamente por marca/distribuidor/categoría/familia/producto).
- Respuesta a solicitudes con botón "Sugerir respuesta con IA".
- Landing/Hero/Posts editables.
- Settings, branding y API Keys editables desde la UI.
- Tickets al desarrollador (CRUD).
- Feedback de IA centralizado.

### Núcleo
- Motor central `calculateCustomerPrice()` con `baseCost`, `marginPercent`, `appliedMarginRule`, `priceBeforeDiscountUsd`, `appliedDiscountRule`, `finalPriceUsd` y `visibleBreakdown` según rol.
- Costos internos **nunca** visibles para clientes.
- Servicios IA/Serper con fallback a **mocks** si no hay API keys.
- Arquitectura de scrapers con interfaz común y un scraper mock funcional.
- Excel parser canónico con `applyMapping`.

## 9. Qué queda preparado para Fase 2

- IA real para sugerencias de mapeo, normalización, descripciones y respuestas (sólo hace falta cargar `OPENAI_API_KEY`).
- Serper real para imágenes (cargar `SERPER_API_KEY`).
- Edición masiva avanzada: "Generar descripciones con IA en lote" y "Buscar imágenes con Serper en lote" — los servicios están listos, falta la UI de selección/aprobación masiva.
- Scrapers reales: crear archivos en `src/scrapers/<slug>.ts` implementando la interfaz `Scraper`, registrarlos en `src/scrapers/index.ts`.
- Reglas avanzadas con UI para combinar múltiples scopes en una sola regla, plantillas y simulación de precios.
- Visibilidad granular con "modo whitelist" (hoy default es blacklist).

## 10. Qué queda preparado para Fase 3

- Stock real (campos ya existen en `Product.stockQuantity` + `stockStatus`).
- Comparación entre proveedores: agregar tabla `ProductEquivalence` o usar `supplierSku` para vincular.
- Historial de precios: agregar tabla `PriceHistory` (recomendado).
- Auditoría avanzada: agregar tabla `AuditLog`.
- Notificaciones email/WhatsApp: integrar Resend/Twilio en `server/actions/requests.ts` (puntos de extensión listos).
- Integración ERP: el modelo canónico y `RawImportedProduct` permiten exportar fácilmente a sistemas externos.

## 11. Decisiones técnicas relevantes

- **Schema completo desde Fase 1**: el modelo cubre todas las fases para evitar migraciones rompedoras posteriores.
- **JWT + middleware Edge** para protección de rutas (no DB hits para cada request).
- **Server actions tipadas**: las que se usan directo en `<form action>` retornan `Promise<void>`; las que necesitan feedback al cliente retornan `{ ok, error }` y se invocan desde `useTransition`.
- **Mocks de IA**: el sistema arranca y funciona sin API keys. Cuando se configuran, las mismas funciones llaman a OpenAI/Serper reales sin cambios en la app.
- **Costos protegidos**: `calculateCustomerPrice` arma el breakdown completo; `toVisibleBreakdown(role)` filtra para que el cliente nunca vea costo base ni reglas internas.
- **Raw data siempre preservada**: cada importación guarda `RawImportedProduct.rawJson` para auditoría aunque el producto se haya normalizado.

## 12. Scripts disponibles

```bash
npm run dev           # dev server
npm run build         # build de producción (incluye prisma generate)
npm run start         # servidor de producción
npm run lint          # eslint
npm run db:push       # sincroniza schema con DB (sin migration files)
npm run db:migrate    # crea migration files
npm run db:generate   # regenera Prisma Client
npm run db:seed       # carga datos iniciales
npm run db:studio     # UI de Prisma
```

## 13. Soporte y siguiente paso

Las funcionalidades pedidas que aún no tienen UI completa (edición masiva con IA en lote, scrapers reales, jobs en background) **están modeladas, documentadas y con servicios listos**: no fueron eliminadas. Cada una requiere decisiones puntuales (qué scraper, qué cadencia, qué cola) que conviene tomar antes de implementarlas.

Cualquier admin puede reportar fallas o pedidos al equipo de desarrollo desde
**`/admin/tickets`**.
