import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeSpreadsheetCell } from "./spreadsheet";

describe("sanitizeSpreadsheetCell", () => {
  it("neutraliza fórmulas", () => {
    assert.equal(sanitizeSpreadsheetCell("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
    assert.equal(sanitizeSpreadsheetCell("+54 11"), "'+54 11");
    assert.equal(sanitizeSpreadsheetCell("-1"), "'-1");
    assert.equal(sanitizeSpreadsheetCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(sanitizeSpreadsheetCell("\tcmd"), "'\tcmd");
    assert.equal(sanitizeSpreadsheetCell("\rcmd"), "'\rcmd");
  });
  it("deja intactos los textos normales", () => {
    assert.equal(sanitizeSpreadsheetCell("Juan Pérez"), "Juan Pérez");
    assert.equal(sanitizeSpreadsheetCell("a=b"), "a=b");
    assert.equal(sanitizeSpreadsheetCell(""), "");
  });
});
