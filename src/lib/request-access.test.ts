import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { requestScopeWhere } from "./request-access";

test("con «Ver todos los clientes» no filtra", () => {
  assert.deepEqual(requestScopeWhere({ userId: "u1", seesAllClients: true }), {});
});

test("el vendedor ve solo pedidos de sus clientes (o sin empresa)", () => {
  const where = requestScopeWhere({ userId: "u1", seesAllClients: false });
  assert.deepEqual(where, {
    OR: [
      { client: { ownerId: "u1" } },
      { clientId: null, user: { client: { ownerId: "u1" } } },
      { clientId: null, user: { clientId: null } },
    ],
  });
});

test("listado, ficha y acciones de pedidos del panel usan el filtro", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  assert.match(read("src/app/admin/requests/page.tsx"), /requestAccessWhere\(\)/);
  assert.match(read("src/app/admin/requests/[id]/page.tsx"), /requestAccessWhere\(\)/);
  const actions = read("src/server/actions/requests.ts");
  const adminActions = actions.slice(actions.indexOf("Acciones del panel admin"));
  assert.doesNotMatch(adminActions, /customerRequest(Item)?\.findUnique\(/);
});
