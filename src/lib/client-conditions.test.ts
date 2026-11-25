import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pricesDiffer, resolveConditionsView } from "./client-conditions";

const map = (entries: Array<[string, number]>) => new Map(entries.map(([id, finalPriceUsd]) => [id, { finalPriceUsd }]));

describe("«Activá tus descuentos»: cuándo se muestra y qué precio se ve", () => {
  it("sin condiciones propias no hay control y se ve el precio de siempre", () => {
    const view = resolveConditionsView({ clientId: "cli1", hasOwnConditions: false, cookieValue: undefined, userId: "u1" });
    assert.deepEqual(view, { offerToggle: false, conditionsOn: false, priceClientId: "cli1" });
  });

  it("sin empresa asociada (o equipo Soundtec) tampoco hay control", () => {
    const view = resolveConditionsView({ clientId: null, hasOwnConditions: true, cookieValue: "u1", userId: "u1" });
    assert.equal(view.offerToggle, false);
    assert.equal(view.priceClientId, null);
  });

  it("con condiciones propias: por defecto precio de lista, y con el control prendido sus condiciones", () => {
    const off = resolveConditionsView({ clientId: "cli1", hasOwnConditions: true, cookieValue: undefined, userId: "u1" });
    assert.deepEqual(off, { offerToggle: true, conditionsOn: false, priceClientId: null });
    const on = resolveConditionsView({ clientId: "cli1", hasOwnConditions: true, cookieValue: "u1", userId: "u1" });
    assert.deepEqual(on, { offerToggle: true, conditionsOn: true, priceClientId: "cli1" });
  });

  it("lo prendido por otro usuario en la misma PC no se hereda", () => {
    const view = resolveConditionsView({ clientId: "cli1", hasOwnConditions: true, cookieValue: "otro", userId: "u1" });
    assert.equal(view.conditionsOn, false);
    assert.equal(view.priceClientId, null);
  });

  it("hay condiciones propias si algún producto visible da distinto que la lista", () => {
    assert.equal(pricesDiffer(map([["a", 100], ["b", 50]]), map([["a", 100], ["b", 45]])), true);
    assert.equal(pricesDiffer(map([["a", 100], ["b", 50]]), map([["a", 100.001], ["b", 50]])), false, "centavos de redondeo no cuentan");
    assert.equal(pricesDiffer(map([["a", 100]]), map([["z", 1]])), false);
  });
});
