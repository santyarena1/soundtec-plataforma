# Experiencia Expo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captar leads en exposiciones vía QR (bienvenida mobile-first), catálogo público que arranca por marcas, pedido de cuenta de cliente con aprobación en el admin y activación por link, y un admin de eventos/QR con pantalla de stand y reportes.

**Architecture:** Lógica pura y testeable en `src/lib/expo/*` (CUIT, regla de bienvenida, códigos QR, tokens, agregación de reportes, schema del formulario). Estado del visitante en cookies httpOnly (`st_vid`, `st_qr`, `st_lead`, `st_skip`). Persistencia en modelos Prisma nuevos (deploy con `prisma db push` del build). Server actions para formularios; route handlers para `/e/[code]`, PNG del QR y Excel. Mails detrás de `sendMail()` que no envía hasta que haya `RESEND_API_KEY`.

**Tech Stack:** Next.js 14 (app router, server actions), Prisma 5 / Postgres, zod, bcryptjs, xlsx, `qrcode` (nuevo), Tailwind, node:test vía `tsx --test`.

**Spec:** `docs/specs/2026-10-04-expo-leads-catalogo-design.md`

**Convenciones del repo (leer antes de empezar):**
- Textos de UI y comentarios en castellano rioplatense. Commits `feat:/fix:/docs:` con el trailer de Co-Authored-By que indique la sesión.
- Tests: `node:test` + `assert/strict`, importan el módulo por ruta relativa, no tocan la DB. Cada test nuevo se agrega a mano al script `"test"` de `package.json`.
- Archivos con CRLF: editarlos con la herramienta Edit, no con `sed`.
- El worktree es compartido: commitear SOLO los paths de la tarea (`git add <paths>`), nunca `git add -A`.
- `params`/`searchParams` de páginas se tipan como `Promise<...>` y se hace `await` (patrón del repo).
- Typecheck: `npx tsc --noEmit -p .` (ignorar errores bajo `.next/`).
- No pushear: el push dispara deploy. Lo hace el coordinador al final, junto con la entrada del changelog.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` | Modelos ExpoEvent, ExpoQr, ExpoVisit, VisitorLead, AccountRequest, AccountActivationToken + enums |
| `src/lib/expo/cuit.ts` | Normalizar y validar CUIT (dígito verificador) |
| `src/lib/expo/event-status.ts` | Estado de un evento según fechas |
| `src/lib/expo/welcome-gate.ts` | Regla: bienvenida obligatoria / opcional / no mostrar |
| `src/lib/expo/qr-code.ts` | Generar y validar códigos cortos de QR |
| `src/lib/expo/activation-token.ts` | Token de activación (token en claro + hash) |
| `src/lib/expo/report.ts` | Agregar visitas en métricas de reporte |
| `src/lib/expo/account-request-schema.ts` | zod del formulario de cuenta + opciones de actividad |
| `src/lib/expo/visitor-cookies.ts` | Nombres de cookies y helpers de lectura |
| `src/lib/rate-limit.ts` | Rate limit genérico (key, limit, ventana) sobre RateLimitBucket |
| `src/server/mailer.ts` | `sendMail()` vía Resend HTTP API; no envía sin key |
| `src/server/expo/visits.ts` | `recordVisit()` best-effort |
| `src/lib/catalog-brands.ts` | Marcas con logo y cantidad de productos activos |
| `src/app/e/[code]/route.ts` | Escaneo de QR → cookies + visita + redirect |
| `src/server/actions/visitor-lead.ts` | Enviar bienvenida / saltear |
| `src/components/expo/welcome-screen.tsx` | UI de bienvenida (client) |
| `src/app/catalogo/layout.tsx` | Decide si muestra la bienvenida |
| `src/app/catalogo/brand-grid.tsx` | Grilla de marcas |
| `src/app/catalogo/brand-bar.tsx` | Barra de marcas deslizable |
| `src/components/catalog/account-cta.tsx` | CTA fijo del catálogo y bloque de la ficha |
| `src/app/catalogo/page.tsx` | Grilla vs listado, barra, CTA, registro BRAND_VIEW |
| `src/app/catalogo/[id]/page.tsx` | Bloque CTA + orden de secciones |
| `src/app/portal/products/[id]/page.tsx` | Orden de secciones |
| `src/components/layout/public-navbar.tsx` | Logo oficial |
| `src/app/solicitar-cuenta/*` | Página + formulario de solicitud |
| `src/server/actions/account-requests.ts` | Enviar / aprobar / rechazar solicitudes |
| `src/app/admin/account-requests/*` | Bandeja admin |
| `src/components/layout/admin-sidebar-nav.tsx`, `admin-shell.tsx` | Ítem + contador de pendientes |
| `src/app/activar/[token]/*` + `src/server/actions/activate-account.ts` | Activación de cuenta |
| `src/server/actions/expo-events.ts` | CRUD eventos y QR |
| `src/app/admin/settings/expo/*` | Admin de eventos, QR y reportes |
| `src/app/api/admin/expo/qr/[code]/route.ts` | PNG del QR |
| `src/app/api/admin/expo/events/[id]/leads/route.ts` | Excel de leads |
| `src/app/expo/pantalla/[code]/page.tsx` | Pantalla del stand |
| `src/lib/settings-sections.ts` | Registrar la sección "Eventos y QR" |

---

### Task 1: Modelos Prisma

**Files:**
- Modify: `prisma/schema.prisma` (agregar al final; agregar relación en `model User`)

- [ ] **Step 1: Agregar enums y modelos al final de `prisma/schema.prisma`**

```prisma
// ─── Experiencia Expo: eventos, QR, visitas, leads y solicitudes de cuenta ───

enum ExpoDisplayOrientation {
  AUTO
  LANDSCAPE
  PORTRAIT
}

enum ExpoVisitType {
  SCAN
  BRAND_VIEW
  LEAD
  ACCOUNT_REQUEST
}

enum VisitorLeadSource {
  QR
  WEB
}

enum AccountRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

/// Evento (una expo). El estado se deriva de startsAt/endsAt.
model ExpoEvent {
  id                 String                 @id @default(cuid())
  name               String
  startsAt           DateTime
  endsAt             DateTime
  displayOrientation ExpoDisplayOrientation @default(AUTO)
  qrs                ExpoQr[]
  leads              VisitorLead[]
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @updatedAt

  @@index([startsAt])
}

/// Un QR de un evento (ej. "Televisor del stand"). `code` va en /e/<code>.
model ExpoQr {
  id        String        @id @default(cuid())
  eventId   String
  event     ExpoEvent     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  label     String
  code      String        @unique
  isActive  Boolean       @default(true)
  visits    ExpoVisit[]
  leads     VisitorLead[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@index([eventId])
}

/// Cada cosa medible que hace un visitante. Fuente de todos los reportes.
model ExpoVisit {
  id        String        @id @default(cuid())
  qrId      String?
  qr        ExpoQr?       @relation(fields: [qrId], references: [id], onDelete: SetNull)
  visitorId String
  type      ExpoVisitType
  brandId   String?
  createdAt DateTime      @default(now())

  @@index([qrId, type])
  @@index([visitorId])
  @@index([createdAt])
}

/// Lead de la bienvenida del catálogo (mail obligatorio).
model VisitorLead {
  id        String            @id @default(cuid())
  email     String
  name      String?
  company   String?
  phone     String?
  interest  String?           @db.Text
  visitorId String
  eventId   String?
  event     ExpoEvent?        @relation(fields: [eventId], references: [id], onDelete: SetNull)
  qrId      String?
  qr        ExpoQr?           @relation(fields: [qrId], references: [id], onDelete: SetNull)
  source    VisitorLeadSource @default(WEB)
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  @@index([eventId])
  @@index([email])
  @@index([createdAt])
}

/// Pedido de cuenta de cliente desde el catálogo público.
model AccountRequest {
  id              String               @id @default(cuid())
  fullName        String
  email           String
  phone           String
  company         String
  cuit            String
  location        String?
  activity        String
  activityOther   String?
  website         String?
  comment         String?              @db.Text
  status          AccountRequestStatus @default(PENDING)
  rejectionReason String?
  leadId          String?
  qrId            String?
  visitorId       String?
  reviewedById    String?
  reviewedAt      DateTime?
  createdClientId String?
  createdUserId   String?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@index([status, createdAt])
  @@index([email])
}

/// Link de un solo uso para que el cliente aprobado cree su contraseña.
model AccountActivationToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

- [ ] **Step 2: Agregar la relación inversa en `model User`**

Dentro de `model User { ... }`, junto a las otras back-relations, agregar la línea:

```prisma
  activationTokens AccountActivationToken[]
```

- [ ] **Step 3: Validar y generar el cliente**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` y `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(expo): modelos de eventos, QR, visitas, leads y solicitudes de cuenta"
```

---

### Task 2: CUIT (validación)

**Files:**
- Create: `src/lib/expo/cuit.ts`
- Test: `src/lib/expo/cuit.test.ts`
- Modify: `package.json` (script `test`)

- [ ] **Step 1: Escribir el test**

```ts
/**
 * CUIT: 11 dígitos, prefijo válido y dígito verificador (módulo 11).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCuit, isValidCuit, normalizeCuit } from "./cuit";

describe("normalizeCuit", () => {
  it("deja solo dígitos", () => {
    assert.equal(normalizeCuit("30-71234567-1"), "30712345671");
    assert.equal(normalizeCuit(" 20 12345678 6 "), "20123456786");
  });
});

describe("isValidCuit", () => {
  it("acepta CUITs con dígito verificador correcto", () => {
    assert.equal(isValidCuit("20-12345678-6"), true);
    assert.equal(isValidCuit("30-50001091-2"), true);
  });
  it("rechaza dígito verificador incorrecto", () => {
    assert.equal(isValidCuit("20-12345678-7"), false);
  });
  it("rechaza largo o prefijo inválido", () => {
    assert.equal(isValidCuit("2012345678"), false);
    assert.equal(isValidCuit("99-12345678-6"), false);
    assert.equal(isValidCuit(""), false);
  });
});

describe("formatCuit", () => {
  it("formatea como XX-XXXXXXXX-X", () => {
    assert.equal(formatCuit("20123456786"), "20-12345678-6");
  });
});
```

- [ ] **Step 2: Agregar el test al script y correrlo (debe fallar)**

En `package.json`, al final del valor de `"test"` agregar ` src/lib/expo/cuit.test.ts` (separado por espacio, dentro del string).

Run: `npx tsx --test src/lib/expo/cuit.test.ts`
Expected: FAIL — `Cannot find module './cuit'`.

- [ ] **Step 3: Implementar**

```ts
/** CUIT argentino: normalización y dígito verificador (módulo 11). */

const PREFIXES = new Set(["20", "23", "24", "27", "30", "33", "34"]);
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizeCuit(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCuit(raw: string): boolean {
  const cuit = normalizeCuit(raw);
  if (cuit.length !== 11 || !PREFIXES.has(cuit.slice(0, 2))) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(cuit[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(cuit[10]);
}

export function formatCuit(raw: string): string {
  const c = normalizeCuit(raw);
  return c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : raw;
}
```

- [ ] **Step 4: Correr el test**

Run: `npx tsx --test src/lib/expo/cuit.test.ts`
Expected: PASS (todas). Si `30-50001091-2` falla, recalcular su dígito con la función y reemplazar el ejemplo por un CUIT válido calculado (no cambiar el algoritmo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/expo/cuit.ts src/lib/expo/cuit.test.ts package.json
git commit -m "feat(expo): validación de CUIT"
```

---

### Task 3: Estado del evento y regla de bienvenida

**Files:**
- Create: `src/lib/expo/event-status.ts`, `src/lib/expo/welcome-gate.ts`
- Test: `src/lib/expo/welcome-gate.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Test**

```ts
/**
 * Bienvenida: obligatoria si vino por QR de un evento vigente, opcional
 * (con "Saltear") si no, y nunca más si ya dejó datos o salteó.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventStatus } from "./event-status";
import { decideWelcome } from "./welcome-gate";

const d = (s: string) => new Date(s);

describe("eventStatus", () => {
  const ev = { startsAt: d("2026-10-10T09:00:00Z"), endsAt: d("2026-10-12T20:00:00Z") };
  it("PROGRAMADO antes de empezar", () => assert.equal(eventStatus(ev, d("2026-10-09T00:00:00Z")), "SCHEDULED"));
  it("VIGENTE durante", () => assert.equal(eventStatus(ev, d("2026-10-11T00:00:00Z")), "LIVE"));
  it("TERMINADO después", () => assert.equal(eventStatus(ev, d("2026-10-13T00:00:00Z")), "ENDED"));
});

describe("decideWelcome", () => {
  it("no muestra si ya dejó datos", () =>
    assert.equal(decideWelcome({ hasLead: true, skipped: false, qrEventLive: true }), "NONE"));
  it("obligatoria si vino de un QR de evento vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: false, qrEventLive: true }), "REQUIRED"));
  it("obligatoria aunque haya salteado antes, si ahora vino por QR vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: true, qrEventLive: true }), "REQUIRED"));
  it("opcional sin QR vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: false, qrEventLive: false }), "OPTIONAL"));
  it("no muestra si salteó y no hay QR vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: true, qrEventLive: false }), "NONE"));
});
```

- [ ] **Step 2: Agregar ` src/lib/expo/welcome-gate.test.ts` al script `test`, correr y ver FAIL**

Run: `npx tsx --test src/lib/expo/welcome-gate.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `src/lib/expo/event-status.ts`**

```ts
export type ExpoEventStatus = "SCHEDULED" | "LIVE" | "ENDED";

export const EVENT_STATUS_LABEL: Record<ExpoEventStatus, string> = {
  SCHEDULED: "PROGRAMADO",
  LIVE: "VIGENTE",
  ENDED: "TERMINADO",
};

export function eventStatus(event: { startsAt: Date; endsAt: Date }, now: Date = new Date()): ExpoEventStatus {
  if (now < event.startsAt) return "SCHEDULED";
  if (now > event.endsAt) return "ENDED";
  return "LIVE";
}
```

- [ ] **Step 4: Implementar `src/lib/expo/welcome-gate.ts`**

```ts
export type WelcomeMode = "REQUIRED" | "OPTIONAL" | "NONE";

/** Regla de la bienvenida del catálogo (ver spec §2). */
export function decideWelcome(input: { hasLead: boolean; skipped: boolean; qrEventLive: boolean }): WelcomeMode {
  if (input.hasLead) return "NONE";
  if (input.qrEventLive) return "REQUIRED";
  return input.skipped ? "NONE" : "OPTIONAL";
}
```

- [ ] **Step 5: Correr → PASS. Commit**

```bash
git add src/lib/expo/event-status.ts src/lib/expo/welcome-gate.ts src/lib/expo/welcome-gate.test.ts package.json
git commit -m "feat(expo): estado del evento y regla de bienvenida"
```

---

### Task 4: Códigos de QR y token de activación

**Files:**
- Create: `src/lib/expo/qr-code.ts`, `src/lib/expo/activation-token.ts`
- Test: `src/lib/expo/tokens.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateQrCode, isValidQrCode } from "./qr-code";
import { ACTIVATION_TTL_MS, createActivationToken, hashActivationToken } from "./activation-token";

describe("QR code", () => {
  it("genera 7 caracteres sin ambiguos (0/O/1/l/I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateQrCode();
      assert.equal(code.length, 7);
      assert.equal(isValidQrCode(code), true);
      assert.doesNotMatch(code, /[0O1lI]/);
    }
  });
  it("rechaza códigos con caracteres inválidos o largo distinto", () => {
    assert.equal(isValidQrCode("abc"), false);
    assert.equal(isValidQrCode("abc/def"), false);
  });
});

describe("activation token", () => {
  it("el hash es determinístico y distinto del token", () => {
    const { token, tokenHash } = createActivationToken();
    assert.equal(hashActivationToken(token), tokenHash);
    assert.notEqual(token, tokenHash);
    assert.ok(token.length >= 40);
  });
  it("dura 72 horas", () => assert.equal(ACTIVATION_TTL_MS, 72 * 3600 * 1000));
});
```

- [ ] **Step 2: Agregar ` src/lib/expo/tokens.test.ts` al script, correr → FAIL**

- [ ] **Step 3: Implementar `src/lib/expo/qr-code.ts`**

```ts
import { randomInt } from "node:crypto";

/** Alfabeto sin caracteres ambiguos para leer/tipear el código. */
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const LENGTH = 7;

export function generateQrCode(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function isValidQrCode(code: string): boolean {
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c));
}
```

- [ ] **Step 4: Implementar `src/lib/expo/activation-token.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";

export const ACTIVATION_TTL_MS = 72 * 3600 * 1000;

/** Token en claro (va en el link) y su hash (lo único que se guarda). */
export function createActivationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashActivationToken(token) };
}

export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 5: Correr → PASS. Commit**

```bash
git add src/lib/expo/qr-code.ts src/lib/expo/activation-token.ts src/lib/expo/tokens.test.ts package.json
git commit -m "feat(expo): códigos de QR y token de activación"
```

---

### Task 5: Agregación de reportes

**Files:**
- Create: `src/lib/expo/report.ts`
- Test: `src/lib/expo/report.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExpoReport } from "./report";

const v = (qrId: string, visitorId: string, type: "SCAN" | "BRAND_VIEW" | "LEAD" | "ACCOUNT_REQUEST", brandId?: string) => ({
  qrId, visitorId, type, brandId: brandId ?? null,
});

describe("buildExpoReport", () => {
  const report = buildExpoReport(
    [
      v("q1", "a", "SCAN"), v("q1", "a", "SCAN"), v("q1", "b", "SCAN"), v("q2", "c", "SCAN"),
      v("q1", "a", "LEAD"), v("q2", "c", "LEAD"),
      v("q1", "a", "ACCOUNT_REQUEST"),
      v("q1", "a", "BRAND_VIEW", "crestron"), v("q1", "b", "BRAND_VIEW", "crestron"), v("q2", "c", "BRAND_VIEW", "sonance"),
    ],
    { crestron: "Crestron", sonance: "SONANCE" }
  );
  it("cuenta escaneos por visitante único", () => assert.equal(report.totals.scans, 3));
  it("cuenta leads y cuentas", () => {
    assert.equal(report.totals.leads, 2);
    assert.equal(report.totals.accountRequests, 1);
  });
  it("tasa de leads sobre escaneos", () => assert.equal(report.totals.leadRate, 2 / 3));
  it("marcas más vistas ordenadas", () =>
    assert.deepEqual(report.topBrands, [{ brandId: "crestron", name: "Crestron", views: 2 }, { brandId: "sonance", name: "SONANCE", views: 1 }]));
  it("desglose por QR", () => {
    assert.deepEqual(report.byQr.q1, { scans: 2, leads: 1, accountRequests: 1 });
    assert.deepEqual(report.byQr.q2, { scans: 1, leads: 1, accountRequests: 0 });
  });
  it("sin escaneos la tasa es 0", () => assert.equal(buildExpoReport([], {}).totals.leadRate, 0));
});
```

- [ ] **Step 2: Agregar ` src/lib/expo/report.test.ts` al script, correr → FAIL**

- [ ] **Step 3: Implementar**

```ts
export type VisitRow = {
  qrId: string | null;
  visitorId: string;
  type: "SCAN" | "BRAND_VIEW" | "LEAD" | "ACCOUNT_REQUEST";
  brandId: string | null;
};

export type QrCounts = { scans: number; leads: number; accountRequests: number };

export type ExpoReport = {
  totals: QrCounts & { leadRate: number };
  byQr: Record<string, QrCounts>;
  topBrands: Array<{ brandId: string; name: string; views: number }>;
};

/** Escaneos = visitantes únicos por QR; leads y cuentas = eventos únicos por visitante. */
export function buildExpoReport(visits: VisitRow[], brandNames: Record<string, string>): ExpoReport {
  const uniq = new Map<string, Set<string>>(); // `${qr}|${type}` → visitantes
  const brandViews = new Map<string, number>();
  for (const visit of visits) {
    if (visit.type === "BRAND_VIEW") {
      if (visit.brandId) brandViews.set(visit.brandId, (brandViews.get(visit.brandId) ?? 0) + 1);
      continue;
    }
    const key = `${visit.qrId ?? "-"}|${visit.type}`;
    if (!uniq.has(key)) uniq.set(key, new Set());
    uniq.get(key)!.add(visit.visitorId);
  }
  const byQr: Record<string, QrCounts> = {};
  for (const [key, visitors] of uniq) {
    const [qr, type] = key.split("|");
    byQr[qr] ??= { scans: 0, leads: 0, accountRequests: 0 };
    if (type === "SCAN") byQr[qr].scans = visitors.size;
    if (type === "LEAD") byQr[qr].leads = visitors.size;
    if (type === "ACCOUNT_REQUEST") byQr[qr].accountRequests = visitors.size;
  }
  const totals = Object.values(byQr).reduce(
    (acc, c) => ({ scans: acc.scans + c.scans, leads: acc.leads + c.leads, accountRequests: acc.accountRequests + c.accountRequests }),
    { scans: 0, leads: 0, accountRequests: 0 }
  );
  const topBrands = [...brandViews.entries()]
    .map(([brandId, views]) => ({ brandId, name: brandNames[brandId] ?? "—", views }))
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name));
  return { totals: { ...totals, leadRate: totals.scans ? totals.leads / totals.scans : 0 }, byQr, topBrands };
}
```

- [ ] **Step 4: Correr → PASS. Commit**

```bash
git add src/lib/expo/report.ts src/lib/expo/report.test.ts package.json
git commit -m "feat(expo): agregación de reportes por evento y QR"
```

---

### Task 6: Schema del formulario de cuenta

**Files:**
- Create: `src/lib/expo/account-request-schema.ts`
- Test: `src/lib/expo/account-request-schema.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACTIVITY_OPTIONS, accountRequestSchema } from "./account-request-schema";

const base = {
  fullName: "Ana Pérez", email: "ana@empresa.com", phone: "+54 11 5555-5555", company: "Empresa SA",
  cuit: "20-12345678-6", activity: "Integración AV", activityOther: "", location: "", website: "", comment: "",
};

describe("accountRequestSchema", () => {
  it("acepta un pedido completo", () => assert.equal(accountRequestSchema.safeParse(base).success, true));
  it("exige CUIT válido", () => assert.equal(accountRequestSchema.safeParse({ ...base, cuit: "20-12345678-7" }).success, false));
  it("exige texto si la actividad es Otra", () => {
    assert.equal(accountRequestSchema.safeParse({ ...base, activity: "Otra", activityOther: "" }).success, false);
    assert.equal(accountRequestSchema.safeParse({ ...base, activity: "Otra", activityOther: "Domótica" }).success, true);
  });
  it("rechaza actividad fuera de la lista", () =>
    assert.equal(accountRequestSchema.safeParse({ ...base, activity: "Cualquiera" }).success, false));
  it("normaliza mail en minúsculas y CUIT sin guiones", () => {
    const r = accountRequestSchema.parse({ ...base, email: "ANA@Empresa.com" });
    assert.equal(r.email, "ana@empresa.com");
    assert.equal(r.cuit, "20123456786");
  });
  it("lista de actividades termina en Otra", () => assert.equal(ACTIVITY_OPTIONS.at(-1), "Otra"));
});
```

- [ ] **Step 2: Agregar ` src/lib/expo/account-request-schema.test.ts` al script, correr → FAIL**

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";
import { isValidCuit, normalizeCuit } from "./cuit";

export const ACTIVITY_OPTIONS = [
  "Integración AV",
  "Instalaciones eléctricas",
  "Arquitectura y diseño",
  "Constructora o desarrolladora",
  "Venta de equipos",
  "Otra",
] as const;

const optional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const accountRequestSchema = z
  .object({
    fullName: z.string().trim().min(3, "Ingresá nombre y apellido").max(160),
    email: z.string().trim().toLowerCase().email("Mail inválido").max(200),
    phone: z.string().trim().min(6, "Ingresá un teléfono").max(60),
    company: z.string().trim().min(2, "Ingresá la empresa").max(200),
    cuit: z.string().trim().refine(isValidCuit, "CUIT inválido").transform(normalizeCuit),
    activity: z.enum(ACTIVITY_OPTIONS, { errorMap: () => ({ message: "Elegí la actividad" }) }),
    activityOther: optional(120),
    location: optional(160),
    website: optional(200),
    comment: optional(2000),
  })
  .refine((v) => v.activity !== "Otra" || !!v.activityOther, {
    message: "Contanos a qué se dedica la empresa",
    path: ["activityOther"],
  });

export type AccountRequestInput = z.infer<typeof accountRequestSchema>;
```

- [ ] **Step 4: Correr → PASS. Commit**

```bash
git add src/lib/expo/account-request-schema.ts src/lib/expo/account-request-schema.test.ts package.json
git commit -m "feat(expo): schema del pedido de cuenta con CUIT y actividad"
```

---

### Task 7: Infra: cookies del visitante, rate limit genérico, mailer y visitas

**Files:**
- Create: `src/lib/expo/visitor-cookies.ts`, `src/lib/rate-limit.ts`, `src/server/mailer.ts`, `src/server/expo/visits.ts`

- [ ] **Step 1: `src/lib/expo/visitor-cookies.ts`**

```ts
/** Cookies del visitante del catálogo público (httpOnly, 1 año). */
export const VISITOR_COOKIE = "st_vid";
export const QR_COOKIE = "st_qr";
export const LEAD_COOKIE = "st_lead";
export const SKIP_COOKIE = "st_skip";

export const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 365 * 24 * 3600,
};
```

- [ ] **Step 2: `src/lib/rate-limit.ts`** (misma estrategia que `src/services/ai-assistant/rate-limit.ts`, parametrizada)

```ts
/**
 * Rate limit genérico sobre RateLimitBucket (sobrevive entre isolates de
 * Vercel). Si la DB falla, cae a memoria del proceso.
 */
import { prisma } from "@/lib/prisma";

export interface RateLimitDecision {
  ok: boolean;
  retryAfterSec?: number;
}

const memory = new Map<string, { count: number; windowStart: number }>();

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitDecision {
  const now = Date.now();
  const row = memory.get(key);
  if (!row || now - row.windowStart >= windowMs) {
    memory.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (row.count >= limit) return { ok: false, retryAfterSec: Math.ceil((row.windowStart + windowMs - now) / 1000) };
  row.count += 1;
  return { ok: true };
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
  const cutoff = new Date(Date.now() - windowMs);
  try {
    const row = await prisma.rateLimitBucket.findUnique({ where: { key } });
    if (!row || row.windowStart < cutoff) {
      await prisma.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, windowStart: new Date() },
        update: { count: 1, windowStart: new Date() },
      });
      return { ok: true };
    }
    if (row.count >= limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((row.windowStart.getTime() + windowMs - Date.now()) / 1000)) };
    }
    await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return { ok: true };
  } catch {
    return memoryLimit(key, limit, windowMs);
  }
}
```

- [ ] **Step 3: `src/server/mailer.ts`**

```ts
/**
 * Envío de mails vía la API HTTP de Resend. Mientras no haya RESEND_API_KEY
 * (env) o "mail.resend_api_key" (AdminSetting) no envía nada y lo deja en el
 * log: los flujos funcionan igual (el admin copia el link a mano).
 */
import { getSetting } from "@/lib/settings";

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export type MailResult = { sent: true } | { sent: false; reason: "NO_PROVIDER" | "ERROR" };

const DEFAULT_FROM = "Soundtec <no-responder@soundtecportal.com.ar>";

export async function sendMail(input: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY || (await getSetting("mail.resend_api_key", ""));
  if (!apiKey) {
    console.info(`[mailer] sin proveedor configurado; no se envió "${input.subject}"`);
    return { sent: false, reason: "NO_PROVIDER" };
  }
  const from = (await getSetting("mail.from", "")) || DEFAULT_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html, text: input.text }),
    });
    if (!res.ok) {
      console.error(`[mailer] Resend respondió ${res.status}`, await res.text().catch(() => ""));
      return { sent: false, reason: "ERROR" };
    }
    return { sent: true };
  } catch (error) {
    console.error("[mailer] fallo de red", error);
    return { sent: false, reason: "ERROR" };
  }
}

/** Destinatarios de avisos internos (AdminSetting "mail.notify_account_requests", separados por coma). */
export async function accountRequestRecipients(): Promise<string[]> {
  const raw = await getSetting("mail.notify_account_requests", "");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
```

- [ ] **Step 4: `src/server/expo/visits.ts`**

```ts
import type { ExpoVisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Registra una visita. Best-effort: nunca rompe la navegación. */
export async function recordVisit(input: {
  visitorId: string | undefined;
  qrId?: string | null;
  type: ExpoVisitType;
  brandId?: string | null;
}): Promise<void> {
  if (!input.visitorId) return;
  try {
    await prisma.expoVisit.create({
      data: { visitorId: input.visitorId, qrId: input.qrId ?? null, type: input.type, brandId: input.brandId ?? null },
    });
  } catch (error) {
    console.error("[expo] no se pudo registrar la visita", error);
  }
}

/** QR (con evento) a partir del código de la cookie; null si no existe o está inactivo. */
export async function findQrWithEvent(code: string | undefined) {
  if (!code) return null;
  return prisma.expoQr.findFirst({ where: { code, isActive: true }, include: { event: true } });
}
```

- [ ] **Step 5: Typecheck y commit**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"` → sin errores.

```bash
git add src/lib/expo/visitor-cookies.ts src/lib/rate-limit.ts src/server/mailer.ts src/server/expo/visits.ts
git commit -m "feat(expo): cookies del visitante, rate limit genérico, mailer preparado y registro de visitas"
```

---

### Task 8: Escaneo `/e/[code]`

**Files:**
- Create: `src/app/e/[code]/route.ts`

- [ ] **Step 1: Implementar**

```ts
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isValidQrCode } from "@/lib/expo/qr-code";
import { QR_COOKIE, VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS } from "@/lib/expo/visitor-cookies";
import { findQrWithEvent, recordVisit } from "@/server/expo/visits";

export const dynamic = "force-dynamic";

/**
 * Destino de cada QR: cuenta el escaneo, recuerda de qué QR vino el
 * visitante y lo manda al catálogo (donde la bienvenida decide qué mostrar).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = new URL("/catalogo", req.url);
  const res = NextResponse.redirect(target);
  if (!isValidQrCode(code)) return res;

  const qr = await findQrWithEvent(code);
  if (!qr) return res;

  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value || randomUUID();
  res.cookies.set(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  res.cookies.set(QR_COOKIE, qr.code, VISITOR_COOKIE_OPTIONS);
  await recordVisit({ visitorId, qrId: qr.id, type: "SCAN" });
  return res;
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
git add src/app/e
git commit -m "feat(expo): ruta de escaneo de QR"
```

---

### Task 9: Bienvenida del catálogo

**Files:**
- Create: `src/server/actions/visitor-lead.ts`, `src/components/expo/welcome-screen.tsx`
- Modify: `src/app/catalogo/layout.tsx`

- [ ] **Step 1: Server actions `src/server/actions/visitor-lead.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { eventStatus } from "@/lib/expo/event-status";
import {
  LEAD_COOKIE, QR_COOKIE, SKIP_COOKIE, VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS,
} from "@/lib/expo/visitor-cookies";
import { findQrWithEvent, recordVisit } from "@/server/expo/visits";

export type WelcomeResult = { ok: true } | { ok: false; error: string };

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const leadSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un mail válido").max(200),
  name: opt(160),
  company: opt(200),
  phone: opt(60),
  interest: opt(1000),
  website: z.string().max(0, "spam").optional(), // honeypot: debe venir vacío
});

export async function submitWelcomeLead(formData: FormData): Promise<WelcomeResult> {
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos" };

  const ipHash = hashIp(clientIp(await headers()));
  const limit = await consumeRateLimit(`welcome:ip:${ipHash}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Demasiados intentos. Probá en unos minutos." };

  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value || randomUUID();
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value);
  const { website: _honeypot, ...data } = parsed.data;

  const lead = await prisma.visitorLead.create({
    data: { ...data, visitorId, qrId: qr?.id ?? null, eventId: qr?.eventId ?? null, source: qr ? "QR" : "WEB" },
  });
  await recordVisit({ visitorId, qrId: qr?.id, type: "LEAD" });

  store.set(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  store.set(LEAD_COOKIE, lead.id, VISITOR_COOKIE_OPTIONS);
  return { ok: true };
}

/** "Saltear": solo se permite si no hay un QR de evento vigente. */
export async function skipWelcome(): Promise<WelcomeResult> {
  const store = await cookies();
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value);
  if (qr && eventStatus(qr.event) === "LIVE") return { ok: false, error: "Completá tu mail para continuar" };
  store.set(SKIP_COOKIE, "1", VISITOR_COOKIE_OPTIONS);
  return { ok: true };
}
```

- [ ] **Step 2: UI `src/components/expo/welcome-screen.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { skipWelcome, submitWelcomeLead } from "@/server/actions/visitor-lead";

/**
 * Bienvenida del catálogo (mobile-first). `required` = vino por QR de un
 * evento vigente: no hay "Saltear".
 */
export function WelcomeScreen({ required }: { required: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setError(null);
    start(async () => {
      const r = await submitWelcomeLead(fd);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  function onSkip() {
    start(async () => {
      const r = await skipWelcome();
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center px-4 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className="mx-auto mb-6 h-10 w-auto" />
      <h1 className="text-center text-2xl font-semibold">¡Bienvenido a Soundtec!</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Dejanos tu mail para explorar el catálogo y recibir la info que te interese.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div>
          <Label htmlFor="w-email">Mail *</Label>
          <Input id="w-email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="tu@empresa.com" />
        </div>
        <div>
          <Label htmlFor="w-name">Nombre (opcional)</Label>
          <Input id="w-name" name="name" autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="w-company">Empresa (opcional)</Label>
          <Input id="w-company" name="company" autoComplete="organization" />
        </div>
        <div>
          <Label htmlFor="w-phone">Teléfono (opcional)</Label>
          <Input id="w-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
        </div>
        <div>
          <Label htmlFor="w-interest">¿Qué te interesa? (opcional)</Label>
          <Textarea id="w-interest" name="interest" rows={2} placeholder="Ej.: audio para un restaurante, domótica para una casa…" />
        </div>
        {/* honeypot: invisible para personas */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
          {pending ? "Entrando…" : "Entrar al catálogo →"}
        </Button>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> No hacemos spam. Usamos tus datos solo para responder tu consulta.
        </p>
      </form>
      {!required ? (
        <button type="button" onClick={onSkip} disabled={pending} className="mx-auto mt-4 text-xs text-muted-foreground underline">
          Saltear
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Reemplazar `src/app/catalogo/layout.tsx`**

```tsx
import { cookies } from "next/headers";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";
import { WelcomeScreen } from "@/components/expo/welcome-screen";
import { auth } from "@/lib/auth";
import { eventStatus } from "@/lib/expo/event-status";
import { decideWelcome } from "@/lib/expo/welcome-gate";
import { LEAD_COOKIE, QR_COOKIE, SKIP_COOKIE } from "@/lib/expo/visitor-cookies";
import { findQrWithEvent } from "@/server/expo/visits";

export const metadata = { title: "Catálogo" };

export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await auth().catch(() => null);
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value).catch(() => null);
  const mode = session?.user
    ? "NONE"
    : decideWelcome({
        hasLead: !!store.get(LEAD_COOKIE)?.value,
        skipped: store.get(SKIP_COOKIE)?.value === "1",
        qrEventLive: !!qr && eventStatus(qr.event) === "LIVE",
      });

  return (
    <>
      <PublicNavbar />
      <main className="container-page py-8 sm:py-10">
        {mode === "NONE" ? children : <WelcomeScreen required={mode === "REQUIRED"} />}
      </main>
      <PublicFooter />
    </>
  );
}
```

Antes de reemplazar, leer el layout actual y conservar su `metadata` si tiene más campos.

- [ ] **Step 4: Typecheck y commit**

```bash
git add src/server/actions/visitor-lead.ts src/components/expo/welcome-screen.tsx src/app/catalogo/layout.tsx
git commit -m "feat(expo): bienvenida del catálogo con captura de lead"
```

---

### Task 10: Logo oficial, grilla y barra de marcas, CTA de cuenta

**Files:**
- Create: `src/lib/catalog-brands.ts`, `src/app/catalogo/brand-grid.tsx`, `src/app/catalogo/brand-bar.tsx`, `src/components/catalog/account-cta.tsx`
- Modify: `src/components/layout/public-navbar.tsx`, `src/app/catalogo/page.tsx`

- [ ] **Step 1: `src/lib/catalog-brands.ts`**

```ts
import { prisma } from "@/lib/prisma";

export type CatalogBrand = { id: string; name: string; logoUrl: string | null; count: number };

/** Marcas activas con productos activos, para la grilla y la barra del catálogo público. */
export async function getCatalogBrands(): Promise<CatalogBrand[]> {
  const brands = await prisma.brand.findMany({
    where: { isActive: true, products: { some: { isActive: true } } },
    select: { id: true, name: true, logoUrl: true, _count: { select: { products: { where: { isActive: true } } } } },
  });
  return brands
    .map((b) => ({ id: b.id, name: b.name, logoUrl: b.logoUrl, count: b._count.products }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}
```

- [ ] **Step 2: `src/app/catalogo/brand-grid.tsx`**

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CatalogBrand } from "@/lib/catalog-brands";

/** Primera pantalla del catálogo: elegir marca o ver todo. */
export function BrandGrid({ brands, total }: { brands: CatalogBrand[]; total: number }) {
  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold sm:text-3xl">¿Qué marca buscás?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Elegí una para empezar.</p>
      <Link
        href="/catalogo?all=1"
        className="mt-5 flex items-center justify-between rounded-xl bg-primary px-5 py-4 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
      >
        Ver todos los productos
        <span className="flex items-center gap-1 text-sm font-normal opacity-90">
          {total.toLocaleString("es-AR")} <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((brand) => (
          <Link
            key={brand.id}
            href={`/catalogo?brand=${brand.id}`}
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
          >
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.name} className="max-h-10 max-w-[80%] object-contain" />
            ) : (
              <span className="text-center text-base font-bold tracking-wide">{brand.name}</span>
            )}
            <span className="text-[11px] text-muted-foreground">{brand.count.toLocaleString("es-AR")} productos</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `src/app/catalogo/brand-bar.tsx`**

```tsx
import Link from "next/link";
import type { CatalogBrand } from "@/lib/catalog-brands";

/** Chips de marca deslizables arriba del listado. */
export function BrandBar({ brands, activeBrandId }: { brands: CatalogBrand[]; activeBrandId: string | null }) {
  const chip = (active: boolean) =>
    `flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
    }`;
  return (
    <nav aria-label="Marcas" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <Link href="/catalogo?all=1" className={chip(!activeBrandId)}>Todas</Link>
      {brands.map((brand) => (
        <Link key={brand.id} href={`/catalogo?brand=${brand.id}`} className={chip(brand.id === activeBrandId)}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-4 w-auto max-w-16 object-contain" />
          ) : null}
          {brand.name}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: `src/components/catalog/account-cta.tsx`**

```tsx
import Link from "next/link";
import { ArrowRight, LockOpen } from "lucide-react";

/** Botón fijo abajo (mobile) / franja (desktop) del catálogo público. */
export function StickyAccountCta() {
  return (
    <>
      <div className="h-20 sm:hidden" aria-hidden="true" />
      <Link
        href="/solicitar-cuenta"
        className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg shadow-primary/30 sm:hidden"
      >
        <span>
          <span className="block text-sm font-semibold">¿Querés ver precios?</span>
          <span className="text-xs opacity-90">Solicitá tu cuenta de cliente</span>
        </span>
        <ArrowRight className="h-5 w-5" />
      </Link>
      <div className="mb-6 hidden items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 sm:flex">
        <p className="text-sm"><strong>¿Querés ver precios y stock?</strong> Pedí tu cuenta de cliente en un minuto.</p>
        <Link href="/solicitar-cuenta" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Solicitar cuenta de cliente
        </Link>
      </div>
    </>
  );
}

/** Bloque destacado en la ficha, donde iría el precio. */
export function ProductAccountCta() {
  return (
    <div className="rounded-2xl border-2 border-primary bg-card p-5">
      <p className="flex items-center gap-2 font-semibold"><LockOpen className="h-4 w-4" /> Precio para clientes</p>
      <p className="mt-1 text-sm text-muted-foreground">Creá tu cuenta y accedé a precios, stock y cotizaciones.</p>
      <Link href="/solicitar-cuenta" className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
        Solicitar cuenta de cliente
      </Link>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        ¿Ya tenés cuenta? <Link href="/login" className="underline">Ingresá</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Logo oficial en `src/components/layout/public-navbar.tsx`**

Reemplazar el bloque del `<Link href="/" ...>` que contiene `<BrandLogo .../>` y el texto `{appName}` / "Integramos tecnología" por:

```tsx
        <Link href="/" className="flex min-w-0 items-center" aria-label={appName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className="h-8 w-auto sm:h-9" />
        </Link>
```

Si con ese cambio `logoUrl` y el import de `BrandLogo` quedan sin uso, eliminarlos (conservar `appName`, que se usa en `aria-label`).

- [ ] **Step 6: Modificar `src/app/catalogo/page.tsx`**

1. Imports nuevos: `cookies` de `next/headers`, `countActiveCatalogFilters` de `@/lib/catalog-url`, `getCatalogBrands` de `@/lib/catalog-brands`, `BrandGrid`, `BrandBar`, `StickyAccountCta`, `recordVisit`/`findQrWithEvent` de `@/server/expo/visits`, `VISITOR_COOKIE`/`QR_COOKIE` de `@/lib/expo/visitor-cookies`.
2. Después de `const urlState = parseCatalogSearchParams(rawParams);` agregar:

```ts
  const showAll = rawParams.all === "1";
  const brands = await getCatalogBrands();
  if (!showAll && countActiveCatalogFilters(urlState) === 0 && !urlState.search?.trim()) {
    const total = brands.reduce((acc, b) => acc + b.count, 0);
    return <BrandGrid brands={brands} total={total} />;
  }
  const activeBrandId = urlState.brandIds?.length === 1 ? urlState.brandIds[0] : null;
  if (activeBrandId) {
    const store = await cookies();
    const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value).catch(() => null);
    await recordVisit({ visitorId: store.get(VISITOR_COOKIE)?.value, qrId: qr?.id, type: "BRAND_VIEW", brandId: activeBrandId });
  }
```

Verificar en `src/lib/catalog-url.ts` que `countActiveCatalogFilters` no cuente `sort`, `page` ni `view` por defecto. Si los cuenta, usar en su lugar: `(urlState.brandIds?.length ?? 0) + (urlState.categoryIds?.length ?? 0) + (urlState.familyIds?.length ?? 0) + (urlState.crestronOnly ? 1 : 0) + (urlState.kind && urlState.kind !== "any" ? 1 : 0) === 0`.

3. Justo antes de `<CatalogLayout ...>` insertar `<BrandBar brands={brands} activeBrandId={activeBrandId} />`.
4. Reemplazar la tarjeta Lock "Precios y stock para clientes" (rama no logueada, ~L81-100) por `<StickyAccountCta />`. La rama logueada queda igual.
5. En `pageHref`, conservar `all` si venía (no hace falta cambio: copia todos los params salvo `page`).

- [ ] **Step 7: Typecheck, build local de tipos y commit**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"` → sin errores.

```bash
git add src/lib/catalog-brands.ts src/app/catalogo/brand-grid.tsx src/app/catalogo/brand-bar.tsx src/components/catalog/account-cta.tsx src/components/layout/public-navbar.tsx src/app/catalogo/page.tsx
git commit -m "feat(catalogo): grilla y barra de marcas, CTA de cuenta y logo oficial"
```

---

### Task 11: Fichas de producto: CTA y orden de secciones

**Files:**
- Modify: `src/app/catalogo/[id]/page.tsx`, `src/app/portal/products/[id]/page.tsx`

- [ ] **Step 1: Ficha pública**

En `src/app/catalogo/[id]/page.tsx`:
1. Importar `ProductAccountCta` de `@/components/catalog/account-cta`.
2. En la tarjeta de precio (~L107-146): cuando NO hay sesión, renderizar `<ProductAccountCta />` en lugar de la Card Lock. Con sesión, conservar el botón "Ver en mi portal".
3. Mover el bloque "Descripción técnica" (~L166-182) para que quede inmediatamente después del grid hero (L81-147) y ANTES de `<ProductRichInfo .../>` (~L150-164). El resto (relaciones) queda después de ProductRichInfo.

Orden final: grid (galería + hero + precio/CTA) → Descripción técnica → ProductRichInfo → secciones de relaciones.

- [ ] **Step 2: Ficha del portal**

En `src/app/portal/products/[id]/page.tsx`, dentro de `<ProductBundleProvider>`, el orden final debe ser:
grid hero/precio (L250-312) → `BundleStagingPanel` → configurador (`#configurador`) → **Descripción técnica (Card ~L416-451)** → **`ProductRichInfo` (~L398-414)** → los 7 `CompatibleAccessoriesSection`.
Mover los dos bloques en negrita a ese lugar (dentro del provider, antes del primer `CompatibleAccessoriesSection`). No cambiar su contenido.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/catalogo/[id]/page.tsx" "src/app/portal/products/[id]/page.tsx"
git commit -m "feat(fichas): descripción primero y CTA de cuenta en la ficha pública"
```

---

### Task 12: Solicitar cuenta (público)

**Files:**
- Create: `src/server/actions/account-requests.ts` (solo `submitAccountRequest` en esta tarea), `src/app/solicitar-cuenta/layout.tsx`, `src/app/solicitar-cuenta/page.tsx`, `src/app/solicitar-cuenta/account-request-form.tsx`

- [ ] **Step 1: `src/server/actions/account-requests.ts`**

```ts
"use server";

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { accountRequestSchema } from "@/lib/expo/account-request-schema";
import { formatCuit } from "@/lib/expo/cuit";
import { LEAD_COOKIE, QR_COOKIE, VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { findQrWithEvent, recordVisit } from "@/server/expo/visits";
import { accountRequestRecipients, sendMail } from "@/server/mailer";

export type FieldErrors = Partial<Record<string, string>>;
export type SubmitResult = { ok: true } | { ok: false; error: string; fieldErrors?: FieldErrors };

const WINDOW_MS = 60 * 60 * 1000;

export async function submitAccountRequest(formData: FormData): Promise<SubmitResult> {
  if (String(formData.get("hp") ?? "")) return { ok: true }; // honeypot: se descarta en silencio
  const parsed = accountRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Revisá los campos marcados", fieldErrors };
  }
  const data = parsed.data;

  const ipHash = hashIp(clientIp(await headers()));
  const byIp = await consumeRateLimit(`acct:ip:${ipHash}`, 10, WINDOW_MS);
  const byMail = await consumeRateLimit(`acct:mail:${data.email}`, 3, WINDOW_MS);
  if (!byIp.ok || !byMail.ok) return { ok: false, error: "Ya recibimos tu pedido. Si necesitás algo más, escribinos." };

  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value;
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value).catch(() => null);

  const request = await prisma.accountRequest.create({
    data: {
      ...data,
      leadId: store.get(LEAD_COOKIE)?.value ?? null,
      qrId: qr?.id ?? null,
      visitorId: visitorId ?? null,
    },
  });
  await recordVisit({ visitorId, qrId: qr?.id, type: "ACCOUNT_REQUEST" });

  const to = await accountRequestRecipients();
  if (to.length) {
    const text = `Nueva solicitud de cuenta\n\n${data.fullName} — ${data.company} (CUIT ${formatCuit(data.cuit)})\n${data.email} · ${data.phone}\nActividad: ${data.activity}${data.activityOther ? ` (${data.activityOther})` : ""}\n\nRevisala en /admin/account-requests`;
    await sendMail({ to, subject: `Nueva solicitud de cuenta: ${data.company}`, text, html: text.replace(/\n/g, "<br>") });
  }
  void request;
  return { ok: true };
}

/** Datos para precargar el formulario desde el lead de la bienvenida. */
export async function getAccountRequestPrefill(): Promise<{ fullName?: string; email?: string; phone?: string; company?: string }> {
  const store = await cookies();
  const leadId = store.get(LEAD_COOKIE)?.value;
  if (!leadId) return {};
  const lead = await prisma.visitorLead.findUnique({ where: { id: leadId } }).catch(() => null);
  if (!lead) return {};
  return { fullName: lead.name ?? undefined, email: lead.email, phone: lead.phone ?? undefined, company: lead.company ?? undefined };
}
```

- [ ] **Step 2: `src/app/solicitar-cuenta/layout.tsx`**

```tsx
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";

export const metadata = { title: "Solicitar cuenta de cliente" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      <main className="container-page py-8 sm:py-10">{children}</main>
      <PublicFooter />
    </>
  );
}
```

- [ ] **Step 3: `src/app/solicitar-cuenta/page.tsx`**

```tsx
import { getAccountRequestPrefill } from "@/server/actions/account-requests";
import { AccountRequestForm } from "./account-request-form";

export const dynamic = "force-dynamic";

export default async function SolicitarCuentaPage() {
  const prefill = await getAccountRequestPrefill();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Solicitar cuenta de cliente</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Con tu cuenta vas a ver precios, stock y podés armar cotizaciones. La revisamos y te avisamos.
      </p>
      <AccountRequestForm prefill={prefill} />
    </div>
  );
}
```

- [ ] **Step 4: `src/app/solicitar-cuenta/account-request-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { ACTIVITY_OPTIONS } from "@/lib/expo/account-request-schema";
import { submitAccountRequest, type FieldErrors } from "@/server/actions/account-requests";

type Prefill = { fullName?: string; email?: string; phone?: string; company?: string };

export function AccountRequestForm({ prefill }: { prefill: Prefill }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [activity, setActivity] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    start(async () => {
      const r = await submitAccountRequest(fd);
      if (r.ok) return setDone(true);
      setError(r.error);
      setErrors(r.fieldErrors ?? {});
    });
  }

  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold">¡Recibimos tu solicitud!</h2>
        <p className="mt-1 text-sm text-muted-foreground">La revisamos y te contactamos para activar tu cuenta.</p>
        <Link href="/catalogo" className="mt-5 inline-block text-sm font-semibold text-primary underline">Volver al catálogo</Link>
      </div>
    );
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label htmlFor={`ar-${name}`}>{label}</Label>
      <Input id={`ar-${name}`} name={name} {...props} />
      <FieldError>{errors[name]}</FieldError>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {field("fullName", "Nombre y apellido *", { required: true, defaultValue: prefill.fullName, autoComplete: "name" })}
      {field("email", "Mail *", { required: true, type: "email", defaultValue: prefill.email, autoComplete: "email", inputMode: "email" })}
      {field("phone", "Teléfono / WhatsApp *", { required: true, type: "tel", defaultValue: prefill.phone, autoComplete: "tel", inputMode: "tel" })}
      {field("company", "Empresa *", { required: true, defaultValue: prefill.company, autoComplete: "organization" })}
      {field("cuit", "CUIT *", { required: true, inputMode: "numeric", placeholder: "30-12345678-9" })}
      <div>
        <Label htmlFor="ar-activity">Actividad de la empresa *</Label>
        <Select id="ar-activity" name="activity" required value={activity} onChange={(e) => setActivity(e.target.value)}>
          <option value="" disabled>Elegí una opción</option>
          {ACTIVITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <FieldError>{errors.activity}</FieldError>
      </div>
      {activity === "Otra" ? field("activityOther", "¿A qué se dedica? *", { required: true }) : null}
      {field("location", "Provincia / ciudad")}
      {field("website", "Web o Instagram")}
      <div>
        <Label htmlFor="ar-comment">Comentario</Label>
        <Textarea id="ar-comment" name="comment" rows={3} placeholder="Qué proyectos hacen, qué marcas les interesan…" />
      </div>
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
        {pending ? "Enviando…" : "Enviar solicitud"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">No hacemos spam. Usamos tus datos solo para tu cuenta.</p>
    </form>
  );
}
```

Verificar en `src/components/ui/input.tsx` que `Select`, `Textarea` y `FieldError` existan con esa API (FieldError recibe `children`). Si `FieldError` usa otra prop, adaptar las llamadas.

- [ ] **Step 5: Typecheck y commit**

```bash
git add src/server/actions/account-requests.ts src/app/solicitar-cuenta
git commit -m "feat(cuentas): formulario público de solicitud de cuenta de cliente"
```

---

### Task 13: Bandeja admin, aprobación y activación

**Files:**
- Modify: `src/server/actions/account-requests.ts` (agregar approve/reject)
- Create: `src/app/admin/account-requests/page.tsx`, `src/app/admin/account-requests/request-actions.tsx`, `src/server/actions/activate-account.ts`, `src/app/activar/[token]/page.tsx`, `src/app/activar/[token]/activate-form.tsx`
- Modify: `src/components/layout/admin-sidebar-nav.tsx`, `src/components/layout/admin-shell.tsx`

- [ ] **Step 1: Agregar al final de `src/server/actions/account-requests.ts`**

Agregar imports: `bcrypt` de `bcryptjs`, `randomBytes` de `node:crypto`, `revalidatePath` de `next/cache`, `requirePermission` de `@/lib/auth-helpers`, `ACTIVATION_TTL_MS, createActivationToken` de `@/lib/expo/activation-token`.

```ts
export type ApproveResult = { ok: true; activationUrl: string; mailSent: boolean } | { ok: false; error: string };

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.soundtecportal.com.ar").replace(/\/$/, "");
}

/** Aprobar: crea Client + contacto + User (sin contraseña usable) + token de activación. */
export async function approveAccountRequest(id: string): Promise<ApproveResult> {
  const { user: reviewer } = await requirePermission("clients.manage");
  const req = await prisma.accountRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "La solicitud ya fue revisada." };
  const existing = await prisma.user.findUnique({ where: { email: req.email } });
  if (existing) return { ok: false, error: `Ya existe un usuario con el mail ${req.email}.` };

  const { token, tokenHash } = createActivationToken();
  const unusablePassword = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  const [city, ...rest] = (req.location ?? "").split(",").map((s) => s.trim());

  const { userId } = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        companyName: req.company,
        contactName: req.fullName,
        email: req.email,
        phone: req.phone,
        taxId: req.cuit,
        website: req.website,
        city: city || null,
        province: rest.join(", ") || null,
        segment: req.activity === "Otra" ? req.activityOther : req.activity,
        source: "Solicitud web",
        notes: req.comment,
      },
    });
    await tx.clientContact.create({
      data: { clientId: client.id, name: req.fullName, email: req.email, phone: req.phone, isPrimary: true },
    });
    const user = await tx.user.create({
      data: {
        name: req.fullName, email: req.email, phone: req.phone, passwordHash: unusablePassword,
        role: "CLIENT", clientId: client.id, companyName: client.companyName,
      },
    });
    await tx.accountActivationToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS) },
    });
    await tx.accountRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: reviewer.id, reviewedAt: new Date(), createdClientId: client.id, createdUserId: user.id },
    });
    return { userId: user.id };
  });
  void userId;

  const activationUrl = `${appUrl()}/activar/${token}`;
  const text = `Hola ${req.fullName}, tu cuenta de cliente de Soundtec está aprobada.\n\nCreá tu contraseña acá (vence en 72 horas):\n${activationUrl}`;
  const mail = await sendMail({ to: req.email, subject: "Activá tu cuenta de Soundtec", text, html: text.replace(/\n/g, "<br>") });

  revalidatePath("/admin/account-requests");
  revalidatePath("/admin/clients");
  return { ok: true, activationUrl, mailSent: mail.sent };
}

export async function rejectAccountRequest(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { user: reviewer } = await requirePermission("clients.manage");
  const clean = reason.trim();
  if (clean.length < 3) return { ok: false, error: "Indicá el motivo." };
  const updated = await prisma.accountRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: clean.slice(0, 500), reviewedById: reviewer.id, reviewedAt: new Date() },
  });
  if (!updated.count) return { ok: false, error: "La solicitud ya fue revisada." };
  revalidatePath("/admin/account-requests");
  return { ok: true };
}
```

Verificar con `requirePermission` que devuelve `{ user }` con `user.id` (ver `src/lib/auth-helpers.ts` L62). Si devuelve otra forma, adaptar.

- [ ] **Step 2: `src/app/admin/account-requests/request-actions.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveAccountRequest, rejectAccountRequest } from "@/server/actions/account-requests";

export function RequestActions({ id, phone, name }: { id: string; phone: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; mailSent: boolean } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const approve = () =>
    start(async () => {
      const r = await approveAccountRequest(id);
      if (!r.ok) return setError(r.error);
      setLink({ url: r.activationUrl, mailSent: r.mailSent });
      router.refresh();
    });
  const reject = () =>
    start(async () => {
      const r = await rejectAccountRequest(id, reason);
      if (!r.ok) return setError(r.error ?? "Error");
      router.refresh();
    });

  if (link) {
    const wa = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
      `Hola ${name}, tu cuenta de Soundtec está aprobada. Creá tu contraseña acá: ${link.url}`
    )}`;
    return (
      <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
        <p className="font-semibold text-emerald-800">
          Aprobada. {link.mailSent ? "Le enviamos el mail." : "Mandale el link de activación (vence en 72 h):"}
        </p>
        <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link.url)}>Copiar</Button>
          <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white">
            Enviar por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rejecting ? (
        <div className="flex gap-2">
          <Input placeholder="Motivo del rechazo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="destructive" onClick={reject} disabled={pending}>Rechazar</Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={approve} disabled={pending}>{pending ? "Aprobando…" : "Aprobar"}</Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={pending}>Rechazar</Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: `src/app/admin/account-requests/page.tsx`**

```tsx
import Link from "next/link";
import type { AccountRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCuit } from "@/lib/expo/cuit";
import { formatDate } from "@/lib/utils";
import { RequestActions } from "./request-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Solicitudes de cuenta" };

const TABS: Array<{ key: AccountRequestStatus; label: string }> = [
  { key: "PENDING", label: "Pendientes" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "REJECTED", label: "Rechazadas" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("clients.view");
  const params = await searchParams;
  const status = (TABS.find((t) => t.key === params.status)?.key ?? "PENDING") as AccountRequestStatus;
  const [rows, counts] = await Promise.all([
    prisma.accountRequest.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.accountRequest.groupBy({ by: ["status"], _count: true }),
  ]);
  const countOf = (s: AccountRequestStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitudes de cuenta" description="Pedidos de cuenta de cliente desde el catálogo público y la expo." />
      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/account-requests?status=${t.key}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${t.key === status ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>
            {t.label} ({countOf(t.key)})
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No hay solicitudes" description="Cuando alguien pida una cuenta aparece acá." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
                <div className="space-y-1 text-sm">
                  <p className="text-base font-semibold">{r.company} <span className="text-xs font-normal text-muted-foreground">CUIT {formatCuit(r.cuit)}</span></p>
                  <p>{r.fullName} · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a> · {r.phone}</p>
                  <p className="text-muted-foreground">
                    <Badge tone="muted">{r.activity === "Otra" ? r.activityOther : r.activity}</Badge>
                    {r.location ? ` · ${r.location}` : ""}{r.website ? ` · ${r.website}` : ""}
                  </p>
                  {r.comment ? <p className="whitespace-pre-line text-muted-foreground">{r.comment}</p> : null}
                  <p className="text-xs text-muted-foreground">Recibida {formatDate(r.createdAt)}{r.qrId ? " · vino por QR de expo" : ""}</p>
                  {r.status === "REJECTED" && r.rejectionReason ? <p className="text-xs text-destructive">Motivo: {r.rejectionReason}</p> : null}
                </div>
                {r.status === "PENDING" ? <RequestActions id={r.id} phone={r.phone} name={r.fullName} /> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

Verificar los props de `EmptyState` y los `tone` válidos de `Badge` en `src/components/ui/`; adaptar si difieren.

- [ ] **Step 4: Activación — `src/server/actions/activate-account.ts`**

```ts
"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashActivationToken } from "@/lib/expo/activation-token";

export type TokenState = { ok: true; email: string; name: string } | { ok: false; reason: "INVALID" | "USED" | "EXPIRED" };

export async function checkActivationToken(token: string): Promise<TokenState> {
  const row = await prisma.accountActivationToken.findUnique({
    where: { tokenHash: hashActivationToken(token) },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!row) return { ok: false, reason: "INVALID" };
  if (row.usedAt) return { ok: false, reason: "USED" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, email: row.user.email, name: row.user.name };
}

const schema = z
  .object({ token: z.string().min(20), password: z.string().min(8, "Mínimo 8 caracteres").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export async function activateAccount(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  const state = await checkActivationToken(parsed.data.token);
  if (!state.ok) return { ok: false, error: "El link venció o ya se usó. Pedinos uno nuevo." };
  const tokenHash = hashActivationToken(parsed.data.token);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction(async (tx) => {
    const row = await tx.accountActivationToken.update({ where: { tokenHash }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, isActive: true } });
  });
  return { ok: true };
}
```

- [ ] **Step 5: `src/app/activar/[token]/page.tsx` y `activate-form.tsx`**

```tsx
// page.tsx
import Link from "next/link";
import { checkActivationToken } from "@/server/actions/activate-account";
import { ActivateForm } from "./activate-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activá tu cuenta", robots: { index: false } };

const MESSAGES = {
  INVALID: "Este link no es válido.",
  USED: "Este link ya se usó. Si ya creaste tu contraseña, ingresá directamente.",
  EXPIRED: "Este link venció. Escribinos y te mandamos uno nuevo.",
} as const;

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await checkActivationToken(token);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/logo_soundtec.png" alt="Soundtec" className="mx-auto mb-6 h-10 w-auto" />
      {state.ok ? (
        <>
          <h1 className="text-center text-2xl font-semibold">Hola {state.name}</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">Creá tu contraseña para {state.email}.</p>
          <ActivateForm token={token} email={state.email} />
        </>
      ) : (
        <div className="text-center">
          <p>{MESSAGES[state.reason]}</p>
          <p className="mt-4 text-sm"><Link href="/login" className="underline">Ir a ingresar</Link> · contacto@soundtec.com.ar</p>
        </div>
      )}
    </main>
  );
}
```

```tsx
// activate-form.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { activateAccount } from "@/server/actions/activate-account";

export function ActivateForm({ token, email }: { token: string; email: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mt-6 text-center">
        <p className="font-semibold">¡Listo! Tu cuenta está activa.</p>
        <Link href={`/login?email=${encodeURIComponent(email)}`} className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">
          Ingresar
        </Link>
      </div>
    );
  }
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await activateAccount(fd);
          if (!r.ok) return setError(r.error);
          setDone(true);
        });
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div><Label htmlFor="pw">Contraseña</Label><Input id="pw" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
      <div><Label htmlFor="pw2">Repetir contraseña</Label><Input id="pw2" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-12 w-full" disabled={pending}>{pending ? "Guardando…" : "Crear contraseña"}</Button>
    </form>
  );
}
```

- [ ] **Step 6: Ítem y contador en el menú del admin**

En `src/components/layout/admin-sidebar-nav.tsx`:
1. Agregar `badgeKey?: "accountRequests"` al tipo `NavItem` y la prop `counts?: Partial<Record<"accountRequests", number>>` a `Props` (y desestructurarla en `AdminSidebarNav`).
2. En el grupo "CRM", después de "Clientes", agregar:
   `{ href: "/admin/account-requests", label: "Solicitudes de cuenta", icon: UserPlus, scope: "clients.view", badgeKey: "accountRequests" },` (importar `UserPlus` de `lucide-react`).
3. En el render del Link, después de `<span className="truncate">{item.label}</span>`, agregar:

```tsx
{item.badgeKey && counts?.[item.badgeKey] ? (
  <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
    {counts[item.badgeKey]}
  </span>
) : null}
```

En `src/components/layout/admin-shell.tsx`: agregar al `Promise.all` (L33-41) `prisma.accountRequest.count({ where: { status: "PENDING" } }).catch(() => 0)` (importar `prisma` si no está), y pasar `counts={{ accountRequests: pendingRequests }}` a `<AdminSidebarNav .../>`.

- [ ] **Step 7: Typecheck y commit**

```bash
git add src/server/actions/account-requests.ts src/server/actions/activate-account.ts src/app/admin/account-requests src/app/activar src/components/layout/admin-sidebar-nav.tsx src/components/layout/admin-shell.tsx
git commit -m "feat(cuentas): bandeja admin, aprobación con link de activación y alta de contraseña"
```

---

### Task 14: Admin de eventos y QR, PNG, Excel y pantalla del stand

**Files:**
- Modify: `package.json` (dependencia `qrcode`), `src/lib/settings-sections.ts`
- Create: `src/server/actions/expo-events.ts`, `src/app/admin/settings/expo/page.tsx`, `src/app/admin/settings/expo/[id]/page.tsx`, `src/app/admin/settings/expo/[id]/qr-form.tsx`, `src/app/api/admin/expo/qr/[code]/route.ts`, `src/app/api/admin/expo/events/[id]/leads/route.ts`, `src/app/expo/pantalla/[code]/page.tsx`

- [ ] **Step 1: Instalar qrcode**

Run: `npm install qrcode@^1.5.4 && npm install -D @types/qrcode@^1.5.5`
Expected: se agregan a `package.json` y `package-lock.json`.

- [ ] **Step 2: Registrar la sección en `src/lib/settings-sections.ts`**

En el grupo "Comercial" de `SETTINGS_GROUPS` agregar (importar `QrCode` de `lucide-react`):

```ts
      {
        href: "/admin/settings/expo",
        label: "Eventos y QR",
        description: "Eventos de expo, sus QR, la pantalla del stand y los reportes de leads.",
        icon: QrCode,
        scope: "settings.manage",
      },
```

- [ ] **Step 3: `src/server/actions/expo-events.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { generateQrCode } from "@/lib/expo/qr-code";

const eventSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(3).max(160),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    displayOrientation: z.enum(["AUTO", "LANDSCAPE", "PORTRAIT"]),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "La fecha de fin tiene que ser posterior al inicio" });

export async function saveExpoEvent(formData: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requirePermission("settings.manage");
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { id, ...data } = parsed.data;
  const event = id
    ? await prisma.expoEvent.update({ where: { id }, data })
    : await prisma.expoEvent.create({ data: { ...data, qrs: { create: { label: "Principal", code: generateQrCode() } } } });
  revalidatePath("/admin/settings/expo");
  return { ok: true, id: event.id };
}

export async function createExpoQr(eventId: string, label: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("settings.manage");
  const clean = label.trim();
  if (clean.length < 2) return { ok: false, error: "Poné un nombre (ej. Folleto)" };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.expoQr.create({ data: { eventId, label: clean.slice(0, 80), code: generateQrCode() } });
      revalidatePath(`/admin/settings/expo/${eventId}`);
      return { ok: true };
    } catch (error) {
      if (attempt === 4) throw error; // colisión de código improbable: reintenta
    }
  }
  return { ok: false, error: "No se pudo crear el QR" };
}

export async function toggleExpoQr(qrId: string): Promise<void> {
  await requirePermission("settings.manage");
  const qr = await prisma.expoQr.findUniqueOrThrow({ where: { id: qrId } });
  await prisma.expoQr.update({ where: { id: qrId }, data: { isActive: !qr.isActive } });
  revalidatePath(`/admin/settings/expo/${qr.eventId}`);
}
```

- [ ] **Step 4: Lista de eventos `src/app/admin/settings/expo/page.tsx`**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABEL, eventStatus } from "@/lib/expo/event-status";
import { formatDate } from "@/lib/utils";
import { EventForm } from "./[id]/event-form";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("settings.manage");
  const events = await prisma.expoEvent.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { qrs: true, leads: true } } } });
  return (
    <div className="space-y-6">
      <SettingsSectionHeader href="/admin/settings/expo" />
      <Card><CardContent className="p-5"><h3 className="mb-3 text-sm font-semibold">Nuevo evento</h3><EventForm /></CardContent></Card>
      <div className="space-y-2">
        {events.map((ev) => {
          const status = eventStatus(ev);
          return (
            <Link key={ev.id} href={`/admin/settings/expo/${ev.id}`} className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{ev.name}</p>
                <Badge tone={status === "LIVE" ? "success" : "muted"}>{EVENT_STATUS_LABEL[status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(ev.startsAt)} → {formatDate(ev.endsAt)} · {ev._count.qrs} QR · {ev._count.leads} leads</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Formularios cliente `src/app/admin/settings/expo/[id]/event-form.tsx` y `qr-form.tsx`**

```tsx
// event-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { saveExpoEvent } from "@/server/actions/expo-events";

type EventValues = { id: string; name: string; startsAt: string; endsAt: string; displayOrientation: string };

/** datetime-local espera "YYYY-MM-DDTHH:mm" en hora local. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventForm({ event }: { event?: EventValues }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        for (const key of ["startsAt", "endsAt"]) fd.set(key, new Date(String(fd.get(key))).toISOString());
        start(async () => {
          const r = await saveExpoEvent(fd);
          if (!r.ok) return setError(r.error ?? "Error");
          setError(null);
          if (!event && r.id) router.push(`/admin/settings/expo/${r.id}`);
          else router.refresh();
        });
      }}
    >
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      <div className="sm:col-span-2"><Label htmlFor="ev-name">Nombre</Label><Input id="ev-name" name="name" required defaultValue={event?.name} placeholder="Expo Tecnología 2026" /></div>
      <div><Label htmlFor="ev-start">Inicio</Label><Input id="ev-start" name="startsAt" type="datetime-local" required defaultValue={event ? toLocalInput(event.startsAt) : undefined} /></div>
      <div><Label htmlFor="ev-end">Fin</Label><Input id="ev-end" name="endsAt" type="datetime-local" required defaultValue={event ? toLocalInput(event.endsAt) : undefined} /></div>
      <div>
        <Label htmlFor="ev-or">Pantalla del stand</Label>
        <Select id="ev-or" name="displayOrientation" defaultValue={event?.displayOrientation ?? "AUTO"}>
          <option value="AUTO">Automática (según el monitor)</option>
          <option value="LANDSCAPE">Horizontal</option>
          <option value="PORTRAIT">Vertical</option>
        </Select>
      </div>
      <div className="flex items-end"><Button type="submit" disabled={pending}>{event ? "Guardar cambios" : "Crear evento"}</Button></div>
      {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
    </form>
  );
}
```

```tsx
// qr-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createExpoQr } from "@/server/actions/expo-events";

export function QrForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-xs" placeholder="Nuevo QR (ej. Folleto)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Button variant="outline" disabled={pending} onClick={() => start(async () => {
        const r = await createExpoQr(eventId, label);
        if (!r.ok) return setError(r.error ?? "Error");
        setLabel(""); setError(null); router.refresh();
      })}>+ Nuevo QR</Button>
      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 6: Detalle del evento con reportes `src/app/admin/settings/expo/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABEL, eventStatus } from "@/lib/expo/event-status";
import { buildExpoReport } from "@/lib/expo/report";
import { toggleExpoQr } from "@/server/actions/expo-events";
import { EventForm } from "./event-form";
import { QrForm } from "./qr-form";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("settings.manage");
  const { id } = await params;
  const event = await prisma.expoEvent.findUnique({ where: { id }, include: { qrs: { orderBy: { createdAt: "asc" } } } });
  if (!event) notFound();
  const qrIds = event.qrs.map((q) => q.id);
  const visits = await prisma.expoVisit.findMany({ where: { qrId: { in: qrIds } }, select: { qrId: true, visitorId: true, type: true, brandId: true } });
  const brandIds = [...new Set(visits.map((v) => v.brandId).filter((b): b is string => !!b))];
  const brands = await prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } });
  const report = buildExpoReport(visits, Object.fromEntries(brands.map((b) => [b.id, b.name])));
  const status = eventStatus(event);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="space-y-6">
      <Link href="/admin/settings/expo" className="text-sm text-muted-foreground hover:underline">← Eventos</Link>
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{event.name}</h2>
        <Badge tone={status === "LIVE" ? "success" : "muted"}>{EVENT_STATUS_LABEL[status]}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Escaneos", report.totals.scans.toLocaleString("es-AR")],
          ["Dejaron sus datos", `${report.totals.leads} (${pct(report.totals.leadRate)})`],
          ["Pidieron cuenta", String(report.totals.accountRequests)],
          ["Marca más vista", report.topBrands[0]?.name ?? "—"],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="p-4"><p className="text-xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">QR del evento</h3>
            <a href={`/api/admin/expo/events/${event.id}/leads`} className="text-sm font-medium text-primary underline">Descargar leads (Excel)</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">QR</th><th>Escaneos</th><th>Leads</th><th>Cuentas</th><th /></tr></thead>
              <tbody>
                {event.qrs.map((qr) => {
                  const c = report.byQr[qr.id] ?? { scans: 0, leads: 0, accountRequests: 0 };
                  return (
                    <tr key={qr.id} className="border-t border-border">
                      <td className="py-2">{qr.label} {!qr.isActive ? <Badge tone="muted">inactivo</Badge> : null}<div className="text-xs text-muted-foreground">/e/{qr.code}</div></td>
                      <td>{c.scans}</td><td>{c.leads}</td><td>{c.accountRequests}</td>
                      <td className="space-x-3 whitespace-nowrap text-right text-xs">
                        <a className="underline" href={`/expo/pantalla/${qr.code}`} target="_blank" rel="noreferrer">Abrir pantalla</a>
                        <a className="underline" href={`/api/admin/expo/qr/${qr.code}`}>Descargar PNG</a>
                        <form action={toggleExpoQr.bind(null, qr.id)} className="inline"><button className="underline">{qr.isActive ? "Desactivar" : "Activar"}</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <QrForm eventId={event.id} />
        </CardContent>
      </Card>
      {report.topBrands.length ? (
        <Card><CardContent className="p-5">
          <h3 className="mb-2 text-sm font-semibold">Marcas más vistas</h3>
          <ol className="space-y-1 text-sm">{report.topBrands.slice(0, 10).map((b) => <li key={b.brandId}>{b.name} · {b.views}</li>)}</ol>
        </CardContent></Card>
      ) : null}
      <Card><CardContent className="p-5"><h3 className="mb-3 text-sm font-semibold">Datos del evento</h3>
        <EventForm event={{ id: event.id, name: event.name, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), displayOrientation: event.displayOrientation }} />
      </CardContent></Card>
    </div>
  );
}
```

`toggleExpoQr.bind(null, qr.id)` usado como `action` de `<form>` requiere que la acción acepte `(qrId)`; Next agrega `formData` como argumento extra, que se ignora. Si el tipo protesta, cambiar la firma a `toggleExpoQr(qrId: string, _fd?: FormData)`.

- [ ] **Step 7: PNG `src/app/api/admin/expo/qr/[code]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requirePermission } from "@/lib/auth-helpers";
import { isValidQrCode } from "@/lib/expo/qr-code";

export const dynamic = "force-dynamic";

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.soundtecportal.com.ar").replace(/\/$/, "");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await requirePermission("settings.manage");
  const { code } = await params;
  if (!isValidQrCode(code)) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const png = await QRCode.toBuffer(`${appUrl()}/e/${code}`, { width: 2048, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0E1A2B", light: "#FFFFFF" } });
  return new NextResponse(png, {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="qr-${code}.png"` },
  });
}
```

`requirePermission` redirige si no tiene permiso; en route handlers eso funciona porque Next maneja `redirect()` también ahí.

- [ ] **Step 8: Excel `src/app/api/admin/expo/events/[id]/leads/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("settings.manage");
  const { id } = await params;
  const event = await prisma.expoEvent.findUnique({ where: { id }, select: { name: true } });
  if (!event) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const leads = await prisma.visitorLead.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" }, include: { qr: { select: { label: true } } } });
  const rows = [
    ["Fecha", "Mail", "Nombre", "Empresa", "Teléfono", "Interés", "QR"],
    ...leads.map((l) => [l.createdAt.toISOString().slice(0, 16).replace("T", " "), l.email, l.name ?? "", l.company ?? "", l.phone ?? "", l.interest ?? "", l.qr?.label ?? ""]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Leads");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leads-${slugify(event.name)}.xlsx"`,
    },
  });
}
```

- [ ] **Step 9: Pantalla del stand `src/app/expo/pantalla/[code]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getCatalogBrands } from "@/lib/catalog-brands";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soundtec · Escaneá el QR", robots: { index: false } };

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.soundtecportal.com.ar").replace(/\/$/, "");
}

/**
 * Pantalla para el televisor del stand. AUTO usa la orientación del monitor
 * (CSS orientation); LANDSCAPE/PORTRAIT la fuerzan.
 */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const qr = await prisma.expoQr.findUnique({ where: { code }, include: { event: true } });
  if (!qr) notFound();
  const svg = await QRCode.toString(`${appUrl()}/e/${code}`, { type: "svg", margin: 1, color: { dark: "#0E1A2B", light: "#FFFFFF" } });
  const allBrands = await getCatalogBrands();
  const brands = allBrands.slice(0, 8);
  const total = allBrands.reduce((acc, b) => acc + b.count, 0);
  const forced = qr.event.displayOrientation;
  const layout =
    forced === "LANDSCAPE" ? "grid-cols-[1.1fr_1fr]" : forced === "PORTRAIT" ? "grid-cols-1" : "grid-cols-1 landscape:grid-cols-[1.1fr_1fr]";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f6f7f9] p-[4vmin] text-[#1d2b3a]">
      <div className={`grid w-full max-w-[1600px] items-center gap-[5vmin] ${layout}`}>
        <div className="text-center landscape:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className="mx-auto h-[7vmin] w-auto landscape:mx-0" />
          <h1 className="mt-[4vmin] text-[7vmin] font-semibold leading-[1.05]">Escaneá y explorá<br />todo el catálogo</h1>
          <p className="mt-[2vmin] text-[2.6vmin] text-[#556]">
            Más de {total.toLocaleString("es-AR")} productos de audio, video y control. Pedí tu cuenta y accedé a precios.
          </p>
          <p className="mt-[3vmin] text-[1.8vmin] font-bold tracking-widest text-[#778]">{brands.map((b) => b.name.toUpperCase()).join(" · ")}</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-[min(60vmin,640px)] rounded-[3vmin] bg-white p-[3vmin] shadow-xl [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-[2vmin] text-[2.4vmin] font-semibold">Apuntá la cámara de tu celular</p>
        </div>
      </div>
    </div>
  );
}
```

Nota de seguridad: el SVG lo genera la librería `qrcode` a partir de una URL propia (código validado por la DB), no hay input del usuario en el HTML.

Verificar que `tailwind.config` tenga habilitada la variante `landscape:` (es core de Tailwind 3.2+). Si no existe, usar `@media (orientation: landscape)` vía una clase en `globals.css`.

- [ ] **Step 10: Typecheck y commit**

```bash
git add package.json package-lock.json src/lib/settings-sections.ts src/server/actions/expo-events.ts src/app/admin/settings/expo src/app/api/admin/expo src/app/expo/pantalla
git commit -m "feat(expo): admin de eventos y QR, PNG, Excel de leads y pantalla del stand"
```

---

### Task 15: Verificación integral, review y changelog

**Files:**
- Modify: `src/data/admin-changelog.ts`

- [ ] **Step 1: Tests y tipos**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"` → `# fail 0`.
Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"` → vacío.
Run: `npx prisma validate` → válido.
Run: `npx next build` → termina sin errores (requiere DATABASE_URL de `.env`; si `db push` del script build falla por no tener DB local, correr `npx prisma generate && npx next build` directamente).

- [ ] **Step 2: Code review + security review**

Despachar el agente `code-reviewer` y el `security-reviewer` sobre el diff de la rama (formularios públicos, cookies, tokens, rate limit, route handlers con permisos). Corregir CRITICAL/HIGH.

- [ ] **Step 3: Changelog**

Agregar al final de `SHIPPED_ADMIN_CHANGELOG` en `src/data/admin-changelog.ts` (mismo formato que las entradas existentes; fecha `releasedAt` = momento del push en UTC):

```ts
  {
    id: "ship-2026-10-expo-leads",
    version: "1.19.0",
    releasedAt: "<ISO UTC del push>",
    summary: "Experiencia Expo: QR con captura de leads, catálogo por marcas y pedido de cuenta de cliente.",
    items: [
      { kind: "NUEVO", text: "Configuración → Eventos y QR: creá eventos, sus QR, abrí la pantalla del stand y mirá escaneos, leads y marcas más vistas." },
      { kind: "NUEVO", text: "Al escanear el QR el visitante deja su mail (obligatorio durante el evento) y entra al catálogo." },
      { kind: "NUEVO", text: "El catálogo público arranca con la grilla de marcas y tiene barra de marcas arriba." },
      { kind: "NUEVO", text: "Solicitudes de cuenta: el cliente la pide desde el catálogo; la aprobás en CRM y le mandás el link para crear su contraseña." },
      { kind: "MEJORA", text: "En las fichas de producto la descripción aparece primero, antes de las especificaciones." },
    ],
  },
```

- [ ] **Step 4: Commit**

```bash
git add src/data/admin-changelog.ts
git commit -m "docs: changelog v1.19.0 (experiencia Expo)"
```

- [ ] **Step 5: Push y verificación en producción (lo hace el coordinador)**

Push a `main`, esperar el deploy de Vercel y recorrer en tamaño celular: crear evento → abrir `/e/<code>` → bienvenida obligatoria → grilla de marcas → ficha → solicitar cuenta → aprobar en admin → abrir link de activación → crear contraseña → login. Revisar la pantalla del stand en horizontal y vertical.
