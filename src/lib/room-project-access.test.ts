import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { canAccessRoomProject } from "./room-project-access";

const seller = { userId: "u-seller", permissions: { scopes: ["room_builder.use", "quotes.view_own"] } };

test("el vendedor solo abre sus salas (o ambientes de sus proyectos)", () => {
  assert.equal(canAccessRoomProject({ ownerId: "u-seller" }, seller), true);
  assert.equal(canAccessRoomProject({ ownerId: "u-otro" }, seller), false);
  assert.equal(canAccessRoomProject({ ownerId: "u-otro", parentOwnerId: "u-seller" }, seller), true);
  assert.equal(canAccessRoomProject({ ownerId: "u-otro", parentOwnerId: "u-otro" }, seller), false);
});

test("admin y quien ve las cotizaciones de todos abren cualquiera", () => {
  assert.equal(canAccessRoomProject({ ownerId: "u-otro" }, { userId: "a", permissions: { scopes: [], fullAccess: true } }), true);
  assert.equal(canAccessRoomProject({ ownerId: "u-otro" }, { userId: "a", permissions: { scopes: ["quotes.view_all"] } }), true);
});

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
}

test("todas las rutas de un proyecto controlan el dueño", () => {
  const dir = path.join(process.cwd(), "src/app/api/admin/room-builder/projects/[id]");
  for (const file of routeFiles(dir)) {
    const src = readFileSync(file, "utf8");
    const handlers = (src.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? []).length;
    const guarded = (src.match(/requireRoomProjectAccess\(params\.id\)/g) ?? []).length;
    assert.ok(handlers > 0 && guarded >= handlers, `${path.relative(process.cwd(), file)}: ${guarded}/${handlers} handlers con control de dueño`);
  }
  for (const f of ["src/server/actions/room-project-share.ts", "src/server/actions/room-project-revisions.ts", "src/app/admin/room-builder/[id]/page.tsx"]) {
    assert.match(readFileSync(path.join(process.cwd(), f), "utf8"), /(check|require)RoomProjectAccess\(/, f);
  }
});
