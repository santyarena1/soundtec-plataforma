import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCrestronHomeIndex, crestronModelKey, matchCrestronHome, slugFromProductUrl } from "./match";
import { parseCategoryPage } from "./official-list";

const official = buildCrestronHomeIndex([
  { model: "TSW-770", categories: ["Touch Screens"], url: "https://www.crestron.com/Products/Control-Surfaces/Touch-Screens/TSW-770-W-S", materialNumber: null },
  { model: "HR-310", categories: ["Remotes"], url: "https://www.crestron.com/Products/Remotes/HR-310", materialNumber: null },
  { model: "HZ2-DIMEX", categories: ["Lighting"], url: "https://www.crestron.com/model/6512450", materialNumber: "6512450" },
  { model: "AIR SR4", categories: ["Audio"], url: "https://www.crestron.com/Products/Audio/AIR-SR4-W-T", materialNumber: null },
  { model: "GLPP-1SW3C", categories: ["Lighting"], url: "https://www.crestron.com/Products/Lighting/GLPP-1SW3CN", materialNumber: null },
]);

const product = (modelNumber: string, internalSku: string | null = null) => ({
  internalSku,
  modelNumber,
  manufacturerItem: null,
  normalizedName: modelNumber,
});

test("saca color y terminación del final, pero no los sufijos funcionales", () => {
  assert.equal(crestronModelKey("TSW-770-B-S"), "TSW-770");
  assert.equal(crestronModelKey("HZ2-DIMEX-GLASS-W ENGRAVED"), "HZ2-DIMEX");
  assert.equal(crestronModelKey("HZ2-KPCN-DRK-NKL"), "HZ2-KPCN");
  assert.equal(crestronModelKey("ASPIRE IC6DT-W-T-EACH"), "ASPIRE-IC6DT");
  assert.equal(crestronModelKey("DIN‑DALI‑2"), "DIN-DALI-2");
  assert.equal(crestronModelKey("HR-310-I"), "HR-310-I");
  assert.equal(crestronModelKey("TSW-760-NC-W-S"), "TSW-760-NC");
  assert.equal(crestronModelKey("ULTIMATE IC6-AW-W-T-EACH"), "ULTIMATE-IC6-AW");
});

test("coincide variantes de color y descarta accesorios y otros modelos", () => {
  assert.equal(matchCrestronHome(product("TSW-770-B-S"), official)?.official.model, "TSW-770");
  assert.equal(matchCrestronHome(product("HR-310-W"), official)?.official.model, "HR-310");
  assert.equal(matchCrestronHome(product("AIR-SR4-W-T"), official)?.official.model, "AIR SR4");
  assert.equal(matchCrestronHome(product("TSW-770-GV-B-S"), official), null);
  assert.equal(matchCrestronHome(product("HR-310-BTN ENGRAVED"), official), null);
  assert.equal(matchCrestronHome(product("HR-310-I"), official), null);
  assert.equal(matchCrestronHome(product("TSW-770/1070-RMB-1"), official), null);
});

test("coincide por material number del link y por el slug del link", () => {
  const hit = matchCrestronHome(product("OTRO-NOMBRE", "6512450"), official);
  assert.equal(hit?.by, "material");
  assert.equal(matchCrestronHome(product("GLPP-1SW3CN"), official)?.official.model, "GLPP-1SW3C");
  assert.equal(slugFromProductUrl("https://www.crestron.com/Products/Lighting/GLXP-SW10-(1)"), "GLXP-SW10-(1)");
  assert.equal(crestronModelKey("GLXP-SW10-(1)"), "GLXP-SW10");
});

test("parsea solo renglones con link a crestron.com y saltea los no soportados", () => {
  const html = `<div id="mc-main-content">
    <h2>Crestron Audio</h2><h3>Multiroom</h3>
    <ul>
      <li><p><a href="https://crestron.com/model/6510878">DM-NAX-8ZSA</a> - DM NAX 8-Zone</p></li>
      <li class="discontinued"><p><a href="https://www.crestron.com/Products/Inactive/CNAMPX-16X60">CNAMPX-16X60</a> - Amp</p></li>
    </ul>
    <h3>Unsupported Audio Devices</h3>
    <ul><li><p><a href="https://www.crestron.com/Products/X/CNX-PAD8">CNX-PAD8</a> - no</p></li></ul>
    <h2>Autonomic</h2>
    <ul><li><p>MMS-1E - Single Source Music Streamer</p></li></ul>
  </div>`;
  const rows = parseCategoryPage(html);
  assert.deepEqual(rows.map((r) => r.model), ["DM-NAX-8ZSA", "CNAMPX-16X60"]);
  assert.equal(rows[0].materialNumber, "6510878");
  assert.equal(rows[0].section, "Crestron Audio › Multiroom");
  assert.equal(rows[1].discontinued, true);
});
