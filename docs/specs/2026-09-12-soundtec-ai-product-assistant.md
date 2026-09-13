# Spec — Soundtec AI Product Assistant

Asistente técnico de productos basado **exclusivamente** en el catálogo y la documentación de Soundtec.
Tres superficies: catálogo público (`/catalogo`), admin (`/admin/assistant`) y Expo (`/expo`, mobile-first, sin login).

Prioridades declaradas por el pedido, en este orden: **no alucinar**, velocidad, bajo costo de tokens,
concurrencia alta (Expo con decenas/cientos de teléfonos), buena UX mobile.

---

## 0. Auditoría del estado actual (lo que ya existe y se reutiliza)

| Pieza | Archivo | Cómo se usa en este módulo |
|---|---|---|
| Búsqueda tolerante de productos | `src/lib/product-search.ts` (`productTokenOr`, `buildProductSearchWhere`, `searchRank`, `sortBySearchRelevance`, `SEARCH_RANK_SELECT`) | Base del retrieval. No se escribe un buscador nuevo. |
| Clave normalizada | `src/lib/search-key.ts` (`normalizeForSearch`, `buildProductSearchKey`) | Matching de modelos/SKU sin guiones ni acentos (`cp4n` = `CP-4N`). |
| Servicio OpenAI | `src/services/openai.ts` | Se **exportan** `getOpenAiClient()` / `getOpenAiModel()` (hoy privados) y se agrega `getOpenAiChatModel()`. No se duplica configuración ni se rompen las funciones existentes. |
| Settings | `src/lib/settings.ts` (`getSetting`/`setSetting`, secretos AES-GCM) | Claves `openai.api_key`, `openai.model` y las nuevas `ai.assistant.*`. |
| Rate limit | modelo `RateLimitBucket` (ya en `main`) | Se usa la tabla directamente desde `src/services/ai-assistant/rate-limit.ts`. **No** se importa `src/lib/rate-limit.ts` porque ese archivo todavía no está en `main` (trabajo en curso de otra sesión). Cuando aterrice, se unifica. |
| UI | `src/components/ui/*` (`Modal`, `Button`, `Input`, `Textarea`, `Badge`, `Card`, `EmptyState`) y tokens Tailwind de `globals.css` | Todo el chat se arma con esos componentes. Sin librerías de animación nuevas. |
| Patrón de chat | `src/components/help/help-system.tsx` + `src/server/actions/help-chat.ts` | Referencia de estilo (dock de ayuda del admin). El asistente de productos es otro dominio y otra superficie; no se reemplaza el dock. |
| Catálogo público | `src/app/catalogo/**`, `src/lib/catalog.ts` (`CatalogContext.publicMode` ya anula precios) | El acceso al asistente se agrega **al lado** del buscador tradicional, sin tocar el buscador. |

Restricciones del entorno que condicionan el diseño:

- **Postgres sin pgvector hoy**: `datasource` sin `previewFeatures` ni `postgresqlExtensions`, sin `prisma/migrations` (el build corre `prisma db push`). Ver §6.
- **`prisma db push` en cada deploy** → todo cambio de schema debe ser **aditivo** (nada de borrar/renombrar columnas).
- **CSP**: `connect-src 'self' https://*.vercel-storage.com` → el navegador **no** puede hablar con OpenAI. Todo el LLM es server-side (ya lo era).
- **Middleware**: en `main` no bloquea `/api/*`; en el working tree hay una versión (sin commitear, de otra sesión) que exige login en toda la API con una allow-list `PUBLIC_API`. Las rutas públicas de este módulo (`/api/expo/*`) **deben** entrar en esa allow-list cuando ese trabajo se commitee.
- **Vercel serverless**: no hay memoria compartida entre isolates → cache y rate limit van a Postgres, con fallback en memoria.
- `specifications`, `documents`, `keyFeatures`, `badges` son **columnas JSON** en `Product`; `ProductImage` y `AccessoryRelation` son tablas reales.

---

## 1. Arquitectura

```
pregunta
  │
  ├─ 1. análisis determinístico (0 tokens)
  │     tokens · códigos de modelo · marca · intención · atributo consultado
  │
  ├─ 2. resolución de productos (Postgres)
  │     exacto (sku/modelo/searchKey) → buildProductSearchWhere + searchRank
  │     + productos activos del contexto de la sesión
  │
  ├─ 3. cache de respuesta  → hit ⇒ responder (0 tokens, ~40 ms)
  │
  ├─ 4. atajo determinístico → spec inequívoca ⇒ responder (0 tokens)
  │
  ├─ 5. construcción de contexto con presupuesto
  │     fichas compactas de ≤6 productos, filtradas por scope
  │
  ├─ 6. 1 (una) llamada al LLM con salida JSON estructurada
  │
  └─ 7. validación: IDs contra la DB, fuentes contra el contexto, redacción
```

**Una pregunta = como máximo 1 llamada al LLM.** Nunca dos. Sin llamadas extra para clasificar,
reformular, resumir ni generar sugerencias (§5 y §9).

### Ajustes tras probar contra el catálogo real (2026-09-12)

Lo que se corrigió después de medir con consultas reales, en orden de impacto:

1. **Búsqueda por conceptos, no por bolsa de palabras.** Cada concepto de la pregunta
   ("parlante", "techo", "exterior") es un grupo con sus variantes en inglés y el producto debe
   cumplirlos todos. Si no hay resultados, se suelta el concepto menos importante y se reintenta.
   Antes se pedía OR entre términos y se cortaba en las primeras filas que devolvía Postgres.
2. **Los conceptos fuertes solo cuentan donde el dato es afirmativo** (título, categoría,
   descripción corta, specs). El HTML del fabricante nombra "outdoor" hasta para decir que un
   producto NO es para exterior.
3. **Puente español → inglés** (`synonyms.ts`): las fichas están en inglés y la pregunta en español.
4. **Specs y key features se buscan dentro del JSON**: sin eso, "¿qué parlantes tienen IP66?" no
   encontraba nada porque el buscador del catálogo no alcanza esas columnas.
5. **Los datos duros (IP66, 70V, 4K) son los últimos en soltarse** al relajar la búsqueda.
6. **La cantidad la define el visitante**: "dame 5 opciones" sube el tope de candidatos y viaja al
   prompt; las consultas de listado abren a 8 aunque no digan un número.
7. **Filtro estructurado** para lo que es una columna y no texto (compatibilidad con Crestron Home).
8. **Parsing tolerante de la salida del modelo**: solo el texto es obligatorio. Antes, una etiqueta
   con formato inesperado tiraba abajo toda la respuesta (las comparaciones fallaban siempre).
9. **Render de tablas, listas y negritas** en el chat, con scroll horizontal en el teléfono.

### Fase 1 (este documento, implementada) vs Fase 2+

- **Fase 1**: retrieval sobre datos ya existentes (`Product` + specs + features + relaciones + descripciones).
  Citas tipo "Ficha técnica Soundtec". Los PDF **no** se leen; se listan como documentos disponibles del producto.
- **Fase 2**: `ProductDocument` + `ProductDocumentChunk`, ingestión idempotente de PDFs, retrieval híbrido y citas por página.
- **Fase 3**: panel admin de indexación (estado, reindexar, errores).
- **Fase 4**: dashboard de analytics de Expo y conversión a leads.

---

## 2. Schema (aditivo)

```prisma
enum AiChatSurface      { PUBLIC ADMIN EXPO }
enum AiAnswerStatus     { ANSWERED PARTIAL INSUFFICIENT_INFORMATION OUT_OF_SCOPE ERROR }
enum AiAnswerConfidence { HIGH MEDIUM LOW }

model AiChatSession {
  id               String  @id @default(cuid())
  surface          AiChatSurface
  userId           String?           // sin FK: la sesión sobrevive al borrado del usuario
  anonymousId      String?           // random 32 bytes, generado server-side
  initialProductId String?           // QR de producto
  questionCount    Int     @default(0)
  leadCaptured     Boolean @default(false)
  reminderShownAt  DateTime?
  reminderDismissedAt DateTime?
  activeProductIds String[] @default([])   // memoria determinística de la conversación
  ipHash           String?           // sha256(ip + AUTH_SECRET), nunca la IP
  startedAt        DateTime @default(now())
  lastActivityAt   DateTime @default(now())
  messages AiChatMessage[]
  lead     ExpoLead?
}

model AiChatMessage {
  id            String   @id @default(cuid())
  sessionId     String
  session       AiChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role          String              // "user" | "assistant"
  content       String   @db.Text
  sourcesJson   Json?
  productIds    String[] @default([])
  answerStatus  AiAnswerStatus?
  confidence    AiAnswerConfidence?
  model         String?
  inputTokens   Int?
  outputTokens  Int?
  latencyMs     Int?
  cacheHit      Boolean  @default(false)
  usedLlm       Boolean  @default(false)
  retrievalMode String?             // "EXACT" | "SEARCH" | "CONTEXT" | "NONE"
  candidateCount Int?
  createdAt     DateTime @default(now())
}

model ExpoLead {
  id                String  @id @default(cuid())
  sessionId         String  @unique
  session           AiChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  name String?  email String?  phone String?  company String?  projectInfo String? @db.Text
  initialProductId  String?
  productsOfInterest String[] @default([])
  conversationSummary String? @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model AiAnswerCache {
  key              String   @id          // sha256(scope|pregunta normalizada|ids|knowledgeVersion)
  scope            String                // "PUBLIC" | "ADMIN"
  question         String
  payload          Json                  // AssistantAnswer serializada
  knowledgeVersion String
  hits             Int      @default(0)
  createdAt        DateTime @default(now())
  lastUsedAt       DateTime @default(now())
  expiresAt        DateTime
}
```

Decisiones:

- `initialProductId` / `userId` son `String?` **sin relación**: evita tocar `Product` y `User` (modelos que
  otras sesiones están editando) y evita cascadas sorpresa. Se resuelven con un `findMany` común.
- `activeProductIds` en la sesión = compresión de historial **determinística**, sin gastar tokens (§5).
- `ipHash`: nunca se guarda la IP cruda.

---

## 3. Retrieval (Fase 1)

`src/services/ai-assistant/intent.ts` — **0 tokens**, todo regex/diccionario:

- `modelCodes`: `/\b[A-Z][A-Z0-9]{1,}(?:-[A-Z0-9]+){0,4}\b/` + tokens alfanuméricos tipo `cp4n`, `sa68`, `dm-nvx-360`.
- `brands`: match contra la lista de marcas activas (cacheada 5 min en memoria del isolate).
- `intent`: `SPEC_LOOKUP` · `COMPARISON` (`vs`, `compar`, `diferencia`) · `RECOMMENDATION` (`necesito`, `busco`, `qué me sirve`, `para un/una`) · `COMPATIBILITY` · `ACCESSORY` · `GENERAL`.
- `attribute`: tabla de sinónimos → etiqueta canónica (`IP / resistencia al agua`, `entradas HDMI`, `potencia`, `peso`, `dimensiones`, `montaje`, `impedancia`, `exterior`…). Se usa para (a) filtrar specs en el contexto y (b) habilitar el atajo sin LLM.

`src/services/ai-assistant/retrieval.ts`:

1. **Exacto**: `internalSku | supplierSku | modelNumber | manufacturerItem` igual (case-insensitive) o
   `searchKey contains normalizeForSearch(code)`. Si hay match exacto → `retrievalMode = "EXACT"`, tope 4.
2. **Búsqueda**: `buildProductSearchWhere(queryLimpia)` + `sortBySearchRelevance`, tope `CANDIDATE_CAP`.
   Se prioriza `kind = PRINCIPAL`, `isActive = true`, y se despriorizan `isDiscontinued`.
3. **Contexto**: si la pregunta es de seguimiento ("¿y cuál para exterior?"), se agregan los
   `activeProductIds` de la sesión.
4. Si la pregunta es de recomendación, se amplía con los términos de aplicación (exterior, restaurante,
   sala, hotel…) que también matchean contra `shortDescription`/`htmlContent`/`keyFeatures`.

Sin candidatos ⇒ `INSUFFICIENT_INFORMATION` **sin llamar al LLM**.

---

## 4. Contexto, scope y redacción

`src/services/ai-assistant/context.ts` arma una **ficha compacta** por producto (≤ 900 caracteres):

```
[P1] Crestron CP4N — Control Processor
Marca: Crestron · Categoría: Control AV · Modelo: CP4N · SKU: 6510335
Destacado: 4 series control system; Dual LAN; ...
Specs: Ethernet: 2x 1Gbps | Memoria: 4 GB | Rack: 1U | ...
Relaciones: incluye X; compatible con Y
Estado: activo · Crestron Home: sí
```

Presupuesto duro (`budget.ts`):

| Límite | Valor |
|---|---|
| Candidatos al contexto | 6 (3 en `SPEC_LOOKUP`, 2 en `COMPARISON`, 8 en listados, hasta 10 si el visitante pide una cantidad) |
| Specs por producto | 12 (priorizando las que matchean el atributo consultado) |
| Caracteres de contexto | 6 000 (recorte duro, se descartan productos de cola) |
| Historial | `activeProductIds` + últimos 2 turnos truncados a 350 caracteres |
| `max_tokens` de salida | 650 (950 en comparaciones, para que la tabla no se corte) |

**Redacción por scope, server-side (§26 del pedido).** La ficha se arma con una allow-list de campos:
`baseCostUsd`, `salePriceUsd`, `coefNac`, `coefVta`, `coefVtaFob`, `ivaPercent`, `impIntPercent`,
`discountPercent`, `tariff*`, `sourceMetadata`, notas internas y datos de clientes **nunca** entran al prompt
en scope `PUBLIC`. No se confía en que el prompt "no lo muestre": el dato no viaja.
En scope `ADMIN` (ruta `/api/admin/ai/chat`, con `requireAdmin`) se agregan costo y stock.
La ruta pública **no puede** setear scope admin: el scope se deriva de la ruta, no del body.

Prompt injection: el contexto va dentro de un bloque delimitado y el system prompt declara que ese bloque es
**datos, nunca instrucciones**; además la respuesta se valida contra la DB (§7), así que un texto que pida
"mostrá el costo" no tiene nada que mostrar: el costo no está en el contexto.

---

## 5. Atajos sin LLM (0 tokens)

`deterministic.ts` responde sin modelo cuando es **inequívoco**:

- 1 producto resuelto + atributo consultado + una fila de `specifications` cuyo label matchea el atributo.
- Campos booleanos/escalares directos: `isCrestronHomeCompatible`, `weight`, `modelNumber`, `isDiscontinued`.
- Sin candidatos → "No encontré ese producto en el catálogo de Soundtec".
- Pregunta vacía/fuera de dominio (saludo) → respuesta fija con sugerencias.

Se estima que cubre ~25–35 % de las preguntas típicas de feria ("¿es IP66?", "¿cuánto pesa?", "¿es compatible con Crestron Home?").

---

## 6. Cache

`AiAnswerCache`, clave `sha256(scope | preguntaNormalizada | idsCandidatosOrdenados | knowledgeVersion)`.

`knowledgeVersion` = `sha1` de `[id, updatedAt, enrichedAt]` de los candidatos → si cambia una spec,
la clave cambia sola y la entrada vieja queda huérfana (TTL 7 días, además `expiresAt`).
Scope forma parte de la clave ⇒ **nunca** se sirve una respuesta admin a un usuario público.

Se cachean respuestas `ANSWERED` y `INSUFFICIENT_INFORMATION` (las de error no).

---

## 7. Contrato del endpoint

`POST /api/expo/chat` (público) y `POST /api/admin/ai/chat` (admin) comparten servicio y devuelven:

```jsonc
{
  "ok": true,
  "sessionId": "...",
  "answer": "Sí. El SA68 declara protección IP66 …",
  "status": "ANSWERED",               // ANSWERED | PARTIAL | INSUFFICIENT_INFORMATION | OUT_OF_SCOPE | ERROR
  "confidence": "HIGH",               // HIGH | MEDIUM | LOW
  "products": [{ "id": "...", "name": "...", "brandName": "...", "imageUrl": "...", "href": "/catalogo/...", "reason": "..." }],
  "sources": [{ "type": "SPECIFICATION", "productId": "...", "productName": "...", "title": "Ficha técnica Soundtec", "detail": "IP Rating: IP66" }],
  "suggestions": ["¿Sirve para exterior?", "Compararlo con …"],
  "meta": { "usedLlm": true, "cacheHit": false, "latencyMs": 812, "candidateCount": 3 }
}
```

El LLM devuelve JSON con `productRefs: ["P1","P3"]` (etiquetas del contexto, **no** IDs) y
`sourceRefs: [{ ref, detail }]`. El backend traduce las etiquetas a IDs reales: **es imposible que el
modelo invente un producto**, porque solo puede nombrar etiquetas que el backend puso en el contexto.
Las tarjetas de producto se renderizan desde la DB, nunca desde el texto del modelo.

`suggestions` se generan **determinísticamente** según intención y productos activos (0 tokens).

---

## 8. Rate limit y concurrencia

- `ai:sess:<sessionId>` → 20 preguntas / 10 min.
- `ai:ip:<ipHash>` → 120 preguntas / 10 min (permisivo: una feria comparte NAT).
- Largo máximo del mensaje: 500 caracteres; historial máximo en DB por sesión: sin tope (lectura acotada a 6).
- Timeout del LLM: 20 s (`AbortSignal.timeout`), con 1 reintento corto solo ante 429/503 y jitter.
- Ante 429 sostenido → `status: "ERROR"` con copy "Hay muchas consultas en este momento…" y el chat sigue usable.
- Sin transacciones abiertas mientras se espera a OpenAI. Las escrituras de sesión/mensaje se hacen antes y después, nunca alrededor.
- `maxDuration = 30` en las rutas; `dynamic = "force-dynamic"`.

---

## 9. Costo estimado (gpt-4o-mini, precios de referencia 0,15 US$/1M in · 0,60 US$/1M out)

| Escenario | Tokens in | Tokens out | US$/consulta |
|---|---|---|---|
| Spec de 1 producto | ~1 100 | ~180 | 0,00027 |
| Recomendación (6 candidatos) | ~2 600 | ~350 | 0,00060 |
| Comparación (2 fichas largas) | ~2 200 | ~420 | 0,00058 |
| Atajo sin LLM / cache hit | 0 | 0 | 0 |

Con 30 % de atajos + 25 % de cache: **~US$ 0,30 por cada 1 000 consultas**. Una Expo de 2 000 preguntas
cuesta menos de US$ 1. El costo real se mide con los campos `inputTokens`/`outputTokens` de `AiChatMessage`.

---

## 10. Superficies

- **`/expo`** (nueva, pública, mobile-first): pantalla de bienvenida + modal de contacto opcional +
  chat + recordatorio discreto después de 2 preguntas + soporte de `?product=<id|slug>` para QR.
- **`/catalogo`**: bloque "Preguntale a Soundtec AI" al lado del buscador tradicional, que abre `/expo`
  (el buscador tradicional no se toca).
- **`/admin/assistant`**: mismo chat con scope admin (costo y stock permitidos).

Detalle de UX, animaciones, copy y accesibilidad: §16/17 del pedido, implementado con CSS
(`@keyframes` en `globals.css`) — sin framer-motion ni librerías nuevas — y respetando `prefers-reduced-motion`.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El middleware con auth global aterriza y rompe `/api/expo/*` | Documentado acá y avisado; agregar `/^\/api\/expo(?:\/|$)/` a `PUBLIC_API`. |
| `prisma db push` en build con modelos nuevos | Todo aditivo; sin renombres ni borrados. |
| Sin `OPENAI_API_KEY` | El asistente responde con los atajos determinísticos y, si no alcanza, deriva al buscador tradicional. Nunca tira excepción. |
| Feria sin señal / latencia alta | Cache + atajos + timeout de 20 s + mensajes de error legibles. |
| pgvector no disponible (Fase 2) | Antes de Fase 2 se verifica con `SELECT * FROM pg_available_extensions WHERE name='vector'` desde una ruta admin de diagnóstico. Si no está: retrieval léxico con `tsvector` + `pg_trgm` sobre los chunks, que ya cubre buena parte de las preguntas técnicas; embeddings quedan en una columna `Float[]` con scoring en Node solo para el subconjunto recuperado. Sin vector DB externa. |
