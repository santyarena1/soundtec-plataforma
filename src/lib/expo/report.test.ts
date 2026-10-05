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

  it("un visitante que mira la misma marca varias veces cuenta una vez", () => {
    const r = buildExpoReport(
      [v("q1", "a", "BRAND_VIEW", "crestron"), v("q1", "a", "BRAND_VIEW", "crestron"), v("q2", "a", "BRAND_VIEW", "crestron"), v("q1", "b", "BRAND_VIEW", "crestron")],
      { crestron: "Crestron" }
    );
    assert.deepEqual(r.topBrands, [{ brandId: "crestron", name: "Crestron", views: 2 }]);
  });

  it("un visitante que escanea dos QR cuenta una vez en el total del evento", () => {
    const r = buildExpoReport([v("q1", "a", "SCAN"), v("q2", "a", "SCAN"), v("q1", "a", "LEAD"), v("q2", "a", "LEAD")], {});
    assert.equal(r.totals.scans, 1);
    assert.equal(r.totals.leads, 1);
    assert.equal(r.totals.leadRate, 1);
    assert.deepEqual(r.byQr.q1, { scans: 1, leads: 1, accountRequests: 0 });
    assert.deepEqual(r.byQr.q2, { scans: 1, leads: 1, accountRequests: 0 });
  });
});
