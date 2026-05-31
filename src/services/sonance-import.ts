import * as XLSX from "xlsx";

export type SonanceBrand = "SONANCE" | "IPORT" | "BLAZE by SONANCE";

export interface SonanceProduct {
  name: string;
  supplierSku: string;
  price: number;
  uom: string;
  brand: SonanceBrand;
  category: string;
  subcategory: string;
}

export interface SonanceParseResult {
  fileType: "sonance-iport" | "blaze";
  products: SonanceProduct[];
  brandCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function isSkuString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Keep only the product name part — strip trailing whitespace/parens notes */
function cleanName(s: string): string {
  return s.trim().replace(/\s{2,}/g, " ");
}

/**
 * Detect if a row is a section header (no numeric SKU, no numeric price in expected cols).
 * In Sonance/IPORT format: col[1] (B) is empty or non-numeric  →  header
 */
function isSonanceHeader(row: unknown[]): boolean {
  const colA = row[0];
  const colB = row[1];
  const colC = row[2];
  if (!colA || String(colA).trim() === "") return false;
  // Data row: col B is a number (numeric part#) AND col C is a number (price)
  if (isNumber(colB) && isNumber(colC)) return false;
  // Otherwise it's a header/section row
  return true;
}

/**
 * SONANCE / IPORT file parser.
 * Sheet "Price List" — columns: A=Name, B=PartNum(numeric), C=Price, D=UoM
 */
function parseSonanceIport(ws: XLSX.WorkSheet): SonanceProduct[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const products: SonanceProduct[] = [];
  let brand: SonanceBrand = "SONANCE";
  let category = "";
  let subcategory = "";

  // Depth heuristic: first non-blank header sets category; subsequent ones set subcategory
  // We track the last two header texts
  let lastHeaderDepth = 0;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const colA = row[0];
    const colB = row[1];
    const colC = row[2];
    const colD = row[3];

    const nameStr = String(colA ?? "").trim();
    if (!nameStr) continue;

    // ── Brand switch ──
    if (nameStr === "IPORT" && !colB && !colC) {
      brand = "IPORT";
      category = "";
      subcategory = "";
      lastHeaderDepth = 0;
      continue;
    }

    // ── Section header ──
    if (isSonanceHeader(row)) {
      // Skip pure-noise lines
      if (
        nameStr.startsWith("Custom Grille") ||
        nameStr.startsWith("IN-CEILING SPEAKERS - ORDER") ||
        nameStr.startsWith("IN-CEILING GRILLES") ||
        nameStr.startsWith("PENDANT SPEAKERS - ORDER") ||
        nameStr.startsWith("PENDANT GRILLES") ||
        nameStr.startsWith("SURFACE MOUNT SPEAKERS") ||
        nameStr.startsWith("SURFACE MOUNT GRILLES") ||
        nameStr.startsWith("DOUBLE CHECK") ||
        nameStr.startsWith("THE DISCREET") ||
        nameStr.startsWith("*IN PLACE OF") ||
        nameStr.startsWith("93335") ||
        nameStr.startsWith("WHILE SUPPLIES LAST") ||
        nameStr.startsWith("PRICE LIST INDEX")
      ) {
        continue;
      }

      // Decide if this sets category or subcategory
      // Heuristic: ALL_CAPS long names → category; shorter / mixed case → subcategory
      const isAllCaps =
        nameStr === nameStr.toUpperCase() && nameStr.length > 6;

      if (isAllCaps || lastHeaderDepth === 0) {
        category = nameStr;
        subcategory = "";
        lastHeaderDepth = 1;
      } else {
        subcategory = nameStr;
        lastHeaderDepth = 2;
      }
      continue;
    }

    // ── Product row ──
    if (!isNumber(colB) || !isNumber(colC)) continue;
    if (colC <= 0) continue;

    products.push({
      name: cleanName(nameStr),
      supplierSku: String(Math.round(colB)), // numeric part# → string
      price: colC,
      uom: String(colD ?? "EA").trim() || "EA",
      brand,
      category,
      subcategory,
    });
  }

  return products;
}

/**
 * BLAZE file parser.
 * Sheet "USD - BLAZE PRICE LIST" — range starts at B1.
 * After sheet_to_json with header:1, the array index offset makes:
 *   row[0] = col B = Name, row[1] = col C = SKU, row[2] = col D = Price, row[3] = col E = UoM
 */
function parseBlaze(ws: XLSX.WorkSheet): SonanceProduct[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const products: SonanceProduct[] = [];
  let category = "";
  let subcategory = "";

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const colName = row[0];
    const colSku = row[1];
    const colPrice = row[2];
    const colUom = row[3];

    const nameStr = String(colName ?? "").trim();
    if (!nameStr) continue;

    // Skip the header row
    if (nameStr === "PRICE LIST CONFIDENTIAL") continue;
    if (nameStr.startsWith("(UNI)") || nameStr.startsWith("(US)")) continue;

    // Section header: SKU is empty
    if (!colSku || String(colSku).trim() === "") {
      category = nameStr;
      subcategory = "";
      continue;
    }

    // Sub-section (no price):
    if (!isNumber(colPrice) || colPrice <= 0) {
      if (!isSkuString(colSku)) {
        subcategory = nameStr;
      }
      continue;
    }

    if (!isSkuString(colSku)) continue;

    products.push({
      name: cleanName(nameStr),
      supplierSku: String(colSku).trim(),
      price: colPrice,
      uom: String(colUom ?? "EACH").trim() || "EACH",
      brand: "BLAZE by SONANCE",
      category,
      subcategory,
    });
  }

  return products;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseSonanceExcel(buffer: Buffer): SonanceParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });

  // Detect file type by sheet name
  const sheetNames = wb.SheetNames;
  const isBlazeFile = sheetNames.some((s) =>
    s.toLowerCase().includes("blaze")
  );

  let products: SonanceProduct[];
  let fileType: SonanceParseResult["fileType"];

  if (isBlazeFile) {
    fileType = "blaze";
    const ws = wb.Sheets[sheetNames[0]];
    products = parseBlaze(ws);
  } else {
    fileType = "sonance-iport";
    const ws = wb.Sheets["Price List"] ?? wb.Sheets[sheetNames[0]];
    products = parseSonanceIport(ws);

    // Also parse "Painted Grille Pricing" sheet if present
    const grillWs = wb.Sheets["Painted Grille Pricing"];
    if (grillWs) {
      const grillRows = XLSX.utils.sheet_to_json<unknown[]>(grillWs, {
        header: 1,
        defval: "",
      });
      // This sheet: col A=Name, col B=PartNum, col C=Price(non-painted), col D=UoM, col E=Price(painted)
      let grillCat = "PAINTED GRILLE PRICING";
      for (const row of grillRows) {
        if (!Array.isArray(row)) continue;
        const a = row[0];
        const b = row[1];
        const c = row[2];
        const d = row[3];
        if (!a || String(a).trim() === "") continue;
        if (!isNumber(b) || !isNumber(c)) {
          grillCat = String(a).trim();
          continue;
        }
        if (c <= 0) continue;
        products.push({
          name: cleanName(String(a)),
          supplierSku: String(Math.round(b)),
          price: c,
          uom: String(d ?? "EA").trim() || "EA",
          brand: "SONANCE",
          category: grillCat,
          subcategory: "",
        });
      }
    }
  }

  // Deduplicate by SKU (keep last occurrence)
  const bySkuMap = new Map<string, SonanceProduct>();
  for (const p of products) {
    bySkuMap.set(p.supplierSku, p);
  }
  const deduplicated = Array.from(bySkuMap.values());

  const brandCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const p of deduplicated) {
    brandCounts[p.brand] = (brandCounts[p.brand] ?? 0) + 1;
    const catKey = `${p.brand} › ${p.category}`;
    categoryCounts[catKey] = (categoryCounts[catKey] ?? 0) + 1;
  }

  return { fileType, products: deduplicated, brandCounts, categoryCounts };
}
