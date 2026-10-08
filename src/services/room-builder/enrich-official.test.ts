import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCoverageFromOfficialHtml } from "./enrich-official";

describe("extractCoverageFromOfficialHtml", () => {
  it("lee FOV y range del texto", () => {
    const html = `
      <html><body>
        <h1>Camera X</h1>
        <p>Field of View: 120°</p>
        <p>Maximum range: 8 m</p>
      </body></html>
    `;
    const out = extractCoverageFromOfficialHtml(html, "https://example.com/cam");
    assert.equal(out.hfovDeg, 120);
    assert.equal(out.maxRangeM, 8);
    assert.ok(out.evidence.hfovDeg);
  });

  it("lee diagonal desde tabla", () => {
    const html = `
      <html><body>
        <table>
          <tr><th>Screen Size</th><td>75 in</td></tr>
        </table>
      </body></html>
    `;
    const out = extractCoverageFromOfficialHtml(html, "https://example.com/tv");
    assert.equal(out.diagonalIn, 75);
    assert.ok(out.viewingDistanceMaxM && out.viewingDistanceMaxM > 1);
  });

  it("lee coverage radius de mic", () => {
    const html = `<html><body>Coverage radius: 3.5 m beamforming</body></html>`;
    const out = extractCoverageFromOfficialHtml(html, "https://example.com/mic");
    assert.equal(out.coverageRadiusM, 3.5);
  });
});
