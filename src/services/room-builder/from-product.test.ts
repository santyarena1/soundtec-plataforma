import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftDesignProfileFromProduct } from "./from-product";

describe("draftDesignProfileFromProduct", () => {
  it("mapea cámara con FOV desde specifications sin red", () => {
    const draft = draftDesignProfileFromProduct({
      id: "p1",
      normalizedName: "PTZ Camera 4K",
      aiProductType: "camera",
      aiMountTypes: ["on-wall"],
      widthCm: 15,
      heightCm: 18,
      depthCm: 15,
      vendorProductUrl: "https://example.com/cam",
      specifications: [
        { label: "Field of View", value: "90° horizontal" },
        { label: "Range", value: "10 m" },
      ],
    });
    assert.equal(draft.designRole, "camera");
    assert.equal(draft.hfovDeg, 90);
    assert.equal(draft.mountOptions.includes("wall"), true);
    assert.equal(draft.proxyKey, "ptz_camera");
    assert.ok(draft.completenessScore >= 0.5);
    assert.equal(draft.officialUrl, "https://example.com/cam");
  });

  it("no inventa FOV si no está en ficha", () => {
    const draft = draftDesignProfileFromProduct({
      id: "p2",
      normalizedName: "Mystery Box",
      aiProductType: "accessory",
    });
    assert.equal(draft.hfovDeg, null);
    assert.equal(draft.coverageRadiusM, null);
  });

  it("estima viewing distance desde diagonal de display", () => {
    const draft = draftDesignProfileFromProduct({
      id: "p3",
      normalizedName: 'Commercial Display 75"',
      aiProductType: "display",
      specifications: [{ label: "Diagonal", value: '75"' }],
    });
    assert.equal(draft.designRole, "display");
    assert.equal(draft.diagonalIn, 75);
    assert.ok((draft.viewingDistanceMaxM ?? 0) > (draft.viewingDistanceMinM ?? 0));
  });
});
