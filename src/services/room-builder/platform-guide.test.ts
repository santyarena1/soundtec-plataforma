import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  audioAdvice,
  platformAdvice,
  suggestPlatform,
} from "./platform-guide";

describe("platform-guide", () => {
  it("Home no es para videoconferencia", () => {
    assert.equal(suggestPlatform("videoconference"), "teams");
    assert.equal(suggestPlatform("residential"), "crestron-home");
    const home = platformAdvice("crestron-home");
    assert.match(home.notFor, /videoconferencia/i);
  });

  it("en living recomienda Sonance y no usa Bluesound como códec", () => {
    const rows = audioAdvice("residential", "crestron-home");
    assert.equal(rows.find((r) => r.family === "sonance")?.fit, "recomendado");
    const vc = audioAdvice("videoconference", "teams");
    assert.equal(vc.find((r) => r.family === "bluesound")?.fit, "no");
  });

  it("en lobby Blaze o Bluesound pesan más que un amp de habitación", () => {
    const rows = audioAdvice("lobby", "none");
    assert.equal(rows.find((r) => r.family === "blaze")?.fit, "recomendado");
    assert.equal(rows.find((r) => r.family === "bluesound")?.fit, "recomendado");
  });
});
