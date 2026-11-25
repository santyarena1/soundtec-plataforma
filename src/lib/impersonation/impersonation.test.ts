import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPERSONATION_TTL_MS,
  canImpersonate,
  checkLiveImpersonation,
  impersonationSecret,
  newPayload,
  safeReturnPath,
  signImpersonation,
  verifyImpersonation,
} from "./token";
import { decideDuringImpersonation, isMutatingRequest, portalEquivalent } from "./request-guard";

const SECRET = "secreto-de-prueba-largo-para-tests-0123456789";
const NOW = 1_800_000_000_000;
const base = () => newPayload({ adminId: "admin1", targetId: "cliente1", sessionVersion: 3, logId: "log1", now: NOW });
const hdrs = (h: Record<string, string> = {}) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

test("firma y verifica ida y vuelta", async () => {
  const token = await signImpersonation(base(), SECRET);
  const res = await verifyImpersonation(token, SECRET, { now: NOW + 1000 });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.payload.a, "admin1");
    assert.equal(res.payload.t, "cliente1");
    assert.equal(res.payload.exp, NOW + IMPERSONATION_TTL_MS);
  }
});

test("rechaza un token con los datos cambiados (otro usuario objetivo)", async () => {
  const token = await signImpersonation(base(), SECRET);
  const [v, , sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...base(), t: "otroAdmin" })).toString("base64url");
  const res = await verifyImpersonation(`${v}.${forged}.${sig}`, SECRET, { now: NOW });
  assert.deepEqual(res, { ok: false, reason: "firma" });
});

test("rechaza un token firmado con otra clave", async () => {
  const token = await signImpersonation(base(), "otra-clave-cualquiera-bastante-larga");
  assert.deepEqual(await verifyImpersonation(token, SECRET, { now: NOW }), { ok: false, reason: "firma" });
});

test("rechaza basura y formatos raros", async () => {
  for (const bad of ["", "abc", "v1.x.y", "v2.a.b", "v1..", "v1.!!!.???", "x".repeat(5000)]) {
    const res = await verifyImpersonation(bad, SECRET, { now: NOW });
    assert.equal(res.ok, false, bad.slice(0, 20));
  }
});

test("vence a los 30 minutos", async () => {
  const token = await signImpersonation(base(), SECRET);
  assert.ok((await verifyImpersonation(token, SECRET, { now: NOW + IMPERSONATION_TTL_MS - 1 })).ok);
  assert.deepEqual(await verifyImpersonation(token, SECRET, { now: NOW + IMPERSONATION_TTL_MS }), { ok: false, reason: "vencida" });
  // Para cerrar el registro de una vista vencida se puede leer, nunca para dar acceso.
  assert.ok((await verifyImpersonation(token, SECRET, { now: NOW + IMPERSONATION_TTL_MS * 4, ignoreExpiry: true })).ok);
});

test("sin secreto configurado no hay vista", async () => {
  assert.equal(impersonationSecret({}), null);
  assert.equal(impersonationSecret({ AUTH_SECRET: "corto" }), null);
  assert.equal(impersonationSecret({ AUTH_SECRET: SECRET }), SECRET);
  const token = await signImpersonation(base(), SECRET);
  assert.deepEqual(await verifyImpersonation(token, null), { ok: false, reason: "sin_clave" });
});

test("solo un admin puede ver, y nunca como otro admin", () => {
  const admin = { id: "a", role: "ADMIN", isActive: true };
  assert.ok(canImpersonate(admin, { id: "c", role: "CLIENT", isActive: true }).ok);
  assert.ok(canImpersonate(admin, { id: "s", role: "STAFF", isActive: true }).ok);
  assert.ok(canImpersonate({ ...admin, role: "SUPER_ADMIN" }, { id: "s", role: "STAFF", isActive: true }).ok);
  assert.equal(canImpersonate(admin, { id: "b", role: "ADMIN", isActive: true }).ok, false);
  assert.equal(canImpersonate(admin, { id: "b", role: "SUPER_ADMIN", isActive: true }).ok, false);
  assert.equal(canImpersonate(admin, { id: "a", role: "CLIENT", isActive: true }).ok, false);
  assert.equal(canImpersonate({ id: "v", role: "STAFF", isActive: true }, { id: "c", role: "CLIENT", isActive: true }).ok, false);
  assert.equal(canImpersonate({ id: "v", role: "CLIENT", isActive: true }, { id: "c", role: "CLIENT", isActive: true }).ok, false);
  assert.equal(canImpersonate(admin, { id: "c", role: "CLIENT", isActive: false }).ok, false);
});

test("en cada pedido: admin revocado, sesión cerrada u objetivo promovido a admin cortan la vista", () => {
  const p = base();
  const actor = { id: "admin1", role: "ADMIN", isActive: true, sessionVersion: 3 };
  const target = { id: "cliente1", role: "CLIENT", isActive: true };
  assert.deepEqual(checkLiveImpersonation(p, actor, target), { ok: true });
  assert.deepEqual(checkLiveImpersonation(p, { ...actor, role: "STAFF" }, target), { ok: false, reason: "admin" });
  assert.deepEqual(checkLiveImpersonation(p, { ...actor, isActive: false }, target), { ok: false, reason: "admin" });
  assert.deepEqual(checkLiveImpersonation(p, { ...actor, sessionVersion: 4 }, target), { ok: false, reason: "sesion" });
  assert.deepEqual(checkLiveImpersonation(p, { ...actor, id: "otro" }, target), { ok: false, reason: "sesion" });
  assert.deepEqual(checkLiveImpersonation(p, actor, { ...target, role: "ADMIN" }), { ok: false, reason: "objetivo" });
  assert.deepEqual(checkLiveImpersonation(p, actor, null), { ok: false, reason: "objetivo" });
  assert.deepEqual(checkLiveImpersonation(p, actor, { ...target, isActive: false }), { ok: false, reason: "objetivo" });
});

test("bloquea Server Actions y métodos que escriben; deja leer y salir", () => {
  assert.equal(isMutatingRequest("POST", hdrs()), true);
  assert.equal(isMutatingRequest("GET", hdrs({ "next-action": "abc" })), true);
  assert.equal(isMutatingRequest("GET", hdrs()), false);
  const d = (method: string, pathname: string, h: Record<string, string> = {}) => decideDuringImpersonation({ method, pathname, headers: hdrs(h) });
  assert.equal(d("POST", "/portal/products", { "next-action": "x" }), "block");
  assert.equal(d("POST", "/portal/wishlist"), "block");
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(d(m, "/api/admin/ai/chat"), "block");
  assert.equal(d("POST", "/api/expo/chat"), "block");
  assert.equal(d("POST", "/api/auth/signout"), "block");
  assert.equal(d("GET", "/api/auth/signout"), "block");
  assert.equal(d("GET", "/api/mailing/baja"), "block");
  assert.equal(d("GET", "/portal/products"), "allow");
  assert.equal(d("GET", "/api/files/x.png"), "allow");
  assert.equal(d("GET", "/ver-como/salir"), "exit");
  assert.equal(d("POST", "/ver-como/salir"), "exit");
  assert.equal(d("POST", "/ver-como/salir", { "next-action": "x" }), "block");
  assert.equal(d("GET", "/ver-como/renovar"), "allow");
  assert.equal(d("POST", "/ver-como/renovar"), "block");
});

test("la vuelta solo va a rutas del mismo sitio", () => {
  assert.equal(safeReturnPath("/portal/products?q=1"), "/portal/products?q=1");
  assert.equal(safeReturnPath("https://malo.com"), "/");
  assert.equal(safeReturnPath("//malo.com"), "/");
  assert.equal(safeReturnPath("/\\malo.com"), "/");
  assert.equal(safeReturnPath("/ver-como/salir"), "/");
  assert.equal(safeReturnPath(null, "/portal"), "/portal");
});

test("viendo como cliente, el catálogo público pasa a la misma pantalla del portal", () => {
  assert.equal(portalEquivalent("/catalogo"), "/portal/products");
  assert.equal(portalEquivalent("/catalogo/"), "/portal/products");
  assert.equal(portalEquivalent("/catalogo/comparar"), "/portal/comparar");
  assert.equal(portalEquivalent("/catalogo/abc123"), "/portal/products/abc123");
  assert.equal(portalEquivalent("/catalogo/abc/extra"), null);
  assert.equal(portalEquivalent("/portal/products"), null);
  assert.equal(portalEquivalent("/lista/x"), null);
});

test("el tipo del usuario visto viaja firmado y, si cambia en la base, la vista cae", async () => {
  const p = newPayload({ adminId: "admin1", targetId: "cliente1", sessionVersion: 3, logId: "log1", targetRole: "CLIENT", now: NOW });
  const res = await verifyImpersonation(await signImpersonation(p, SECRET), SECRET, { now: NOW });
  assert.ok(res.ok && res.payload.tr === "CLIENT");
  const actor = { id: "admin1", role: "ADMIN", isActive: true, sessionVersion: 3 };
  assert.deepEqual(checkLiveImpersonation(p, actor, { id: "cliente1", role: "CLIENT", isActive: true }), { ok: true });
  assert.deepEqual(checkLiveImpersonation(p, actor, { id: "cliente1", role: "STAFF", isActive: true }), { ok: false, reason: "objetivo" });
});
