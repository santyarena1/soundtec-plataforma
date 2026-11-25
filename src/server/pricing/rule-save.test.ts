import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRule, saveRuleRows, type Db } from "./rule-save";
import { autoRuleName } from "@/lib/pricing-scope";

/*
 * Guardar reglas de margen con grupos y excepciones sobre una base en memoria
 * (solo lo que usa saveRuleRows). Cubre dos pérdidas de datos:
 *   - editar UNA subregla borraba las excepciones de los otros clientes del grupo;
 *   - «Editar todo» (que abre el nombre vacío) pisaba los nombres propios de las subreglas.
 */
type Row = {
  id: string;
  name: string;
  scopeType: string;
  scopeId: string | null;
  clientId: string | null;
  productId: string | null;
  groupId: string | null;
  isExemption: boolean;
  isActive: boolean;
  priority: number;
  marginPercent: number;
  markupMultiplier: number | null;
};

const BRANDS = [
  { id: "b1", name: "Marca Uno" },
  { id: "b2", name: "Marca Dos" },
];
const CLIENTS = [
  { id: "c1", companyName: "Cliente Uno", contactName: null },
  { id: "c2", companyName: "Cliente Dos", contactName: null },
];
const PRODUCTS = [{ id: "p1", normalizedName: "PRODUCTO 1" }];

type Where = Record<string, unknown>;
function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    const field = (row as unknown as Record<string, unknown>)[key];
    if (value && typeof value === "object" && "in" in (value as object)) return ((value as { in: unknown[] }).in).includes(field);
    return field === value;
  });
}

function memoryDb(seed: Row[]) {
  let rows = [...seed];
  let next = 0;
  const byIds = <T extends { id: string }>(list: T[]) => async ({ where }: { where: { id: { in: string[] } } }) =>
    list.filter((item) => where.id.in.includes(item.id));
  const db = {
    marginRule: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: { where?: Where } = {}) => rows.filter((r) => matches(r, where)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        rows = rows.map((r) => (r.id === where.id ? { ...r, ...data } : r));
      },
      create: async ({ data }: { data: Omit<Row, "id"> }) => {
        next += 1;
        rows = [...rows, { ...data, id: `new-${next}` } as Row];
      },
      delete: async ({ where }: { where: { id: string } }) => {
        rows = rows.filter((r) => r.id !== where.id);
      },
    },
    brand: { findMany: byIds(BRANDS) },
    client: { findMany: byIds(CLIENTS) },
    product: { findMany: byIds(PRODUCTS) },
  };
  return { db: db as unknown as Db, rows: () => rows };
}

function form(entries: Array<[string, string]>): FormData {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

function rule(partial: Partial<Row> & Pick<Row, "id">): Row {
  return {
    name: "",
    scopeType: "BRAND",
    scopeId: "b1",
    clientId: null,
    productId: null,
    groupId: "grp",
    isExemption: false,
    isActive: true,
    priority: 30,
    marginPercent: 50,
    markupMultiplier: 1.5,
    ...partial,
  };
}

test("editar una subregla no borra las excepciones de los otros clientes del grupo", async () => {
  const { db, rows } = memoryDb([
    rule({ id: "r1", clientId: "c1" }),
    rule({ id: "r2", clientId: "c2" }),
    rule({ id: "x1", clientId: "c1", scopeType: "PRODUCT", scopeId: "p1", productId: "p1", isExemption: true }),
    rule({ id: "x2", clientId: "c2", scopeType: "PRODUCT", scopeId: "p1", productId: "p1", isExemption: true }),
  ]);
  const parsed = parseRule(
    form([
      ["id", "r1"],
      ["groupId", "grp"],
      ["audience", "client"],
      ["clientIds", "c1"],
      ["target", "BRAND"],
      ["scopeIds", "b1"],
      ["excludeProductIds", "p1"],
      ["pricingMode", "markup"],
      ["percent", "1.8"],
      ["isActive", "on"],
    ]),
    "margin"
  );
  assert.ok(parsed.ok);
  await saveRuleRows(db, "margin", parsed, { id: "r1", groupId: "grp", excludeProductIds: ["p1"] });
  const exemptions = rows().filter((r) => r.isExemption);
  assert.deepEqual(exemptions.map((r) => r.clientId).sort(), ["c1", "c2"]);
  assert.equal(rows().find((r) => r.id === "r1")?.markupMultiplier, 1.8);
  assert.equal(rows().find((r) => r.id === "r2")?.markupMultiplier, 1.5);
});

test("sacar la excepción de una subregla solo saca la de su cliente", async () => {
  const { db, rows } = memoryDb([
    rule({ id: "r1", clientId: "c1" }),
    rule({ id: "r2", clientId: "c2" }),
    rule({ id: "x1", clientId: "c1", scopeType: "PRODUCT", scopeId: "p1", productId: "p1", isExemption: true }),
    rule({ id: "x2", clientId: "c2", scopeType: "PRODUCT", scopeId: "p1", productId: "p1", isExemption: true }),
  ]);
  const parsed = parseRule(
    form([["id", "r1"], ["groupId", "grp"], ["audience", "client"], ["clientIds", "c1"], ["target", "BRAND"], ["scopeIds", "b1"], ["pricingMode", "markup"], ["percent", "1.5"], ["isActive", "on"]]),
    "margin"
  );
  assert.ok(parsed.ok);
  await saveRuleRows(db, "margin", parsed, { id: "r1", groupId: "grp", excludeProductIds: [] });
  assert.deepEqual(rows().filter((r) => r.isExemption).map((r) => r.id), ["x2"]);
});

test("«Editar todo» sin nombre conserva los nombres propios y regenera los automáticos", async () => {
  const auto = autoRuleName({ kind: "margin", mode: "markup", value: 1.5, audience: "all", target: "BRAND", resourceName: "Marca Dos" });
  const { db, rows } = memoryDb([
    rule({ id: "r1", scopeId: "b1", name: "Promo invierno · Marca Uno" }),
    rule({ id: "r2", scopeId: "b2", name: auto }),
  ]);
  const parsed = parseRule(
    form([["id", "r1"], ["groupId", "grp"], ["replaceGroup", "on"], ["audience", "all"], ["target", "BRAND"], ["scopeIds", "b1"], ["scopeIds", "b2"], ["pricingMode", "markup"], ["percent", "2"], ["isActive", "on"], ["name", ""]]),
    "margin"
  );
  assert.ok(parsed.ok);
  await saveRuleRows(db, "margin", parsed, { id: "r1", groupId: "grp", replaceGroup: true });
  const names = new Map(rows().map((r) => [r.id, r.name]));
  assert.equal(names.get("r1"), "Promo invierno · Marca Uno");
  assert.equal(names.get("r2"), autoRuleName({ kind: "margin", mode: "markup", value: 2, audience: "all", target: "BRAND", resourceName: "Marca Dos" }));
  assert.ok(rows().every((r) => r.markupMultiplier === 2));
});

test("«Editar todo» con nombre nuevo lo pone en todas las subreglas", async () => {
  const { db, rows } = memoryDb([rule({ id: "r1", scopeId: "b1", name: "Viejo" }), rule({ id: "r2", scopeId: "b2", name: "Viejo 2" })]);
  const parsed = parseRule(
    form([["id", "r1"], ["groupId", "grp"], ["replaceGroup", "on"], ["audience", "all"], ["target", "BRAND"], ["scopeIds", "b1"], ["scopeIds", "b2"], ["pricingMode", "markup"], ["percent", "1.5"], ["isActive", "on"], ["name", "Nuevo"]]),
    "margin"
  );
  assert.ok(parsed.ok);
  await saveRuleRows(db, "margin", parsed, { id: "r1", groupId: "grp", replaceGroup: true });
  assert.deepEqual(rows().map((r) => r.name), ["Nuevo", "Nuevo"]);
});
