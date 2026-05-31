import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface TaxEntry {
  position: string;
  aec: string;
  die: string;
  te: string;
  re: string;
  de: string;
  simi: string;
}

export interface NcmResult {
  position: string;
  description: string;
  isLeaf: boolean; // true = posición hoja con arancel; false = categoría/subcapítulo
  aec: string | null;
  die: string | null;
  te: string | null;
  dieNumber: number | null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDieNumber(die: string | null | undefined): number | null {
  if (!die) return null;
  const n = parseFloat(die.replace(",", ".").replace("%", ""));
  return isNaN(n) ? null : n;
}

function parseNcmTable(
  html: string,
  taxMap: Map<string, TaxEntry>
): NcmResult[] {
  const results: NcmResult[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(stripHtml(cellMatch[1]));
    }
    if (cells.length < 2) continue;

    const position = cells[0].trim();
    const description = cells[1].replace(/\s+/g, " ").trim();

    // Accept any row that looks like an NCM position (starts with digits, may contain dots)
    if (!position || !/^\d[\d.]+/.test(position)) continue;
    if (!description) continue;

    // Leaf: ends with an uppercase check digit letter
    const isLeaf = /[A-Z]$/.test(position);

    const normalizedPos = position.replace(/\./g, "").toUpperCase();
    const tax = isLeaf ? taxMap.get(normalizedPos) : undefined;

    results.push({
      position,
      description,
      isLeaf,
      aec: tax?.aec ?? null,
      die: tax?.die ?? null,
      te: tax?.te ?? null,
      dieNumber: parseDieNumber(tax?.die),
    });
  }

  return results;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json([]);

  try {
    const htmlRes = await fetch(
      `https://ncm.pcram.net/?q=${encodeURIComponent(q)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
        cache: "no-store",
      }
    );

    if (!htmlRes.ok) return NextResponse.json([]);

    // Forward the PHP session cookie so taxs.php can return the matching data
    const setCookie = htmlRes.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.split(";")[0]; // e.g. "PHPSESSID=abc123"

    const [html, taxRes] = await Promise.all([
      htmlRes.text(),
      fetch("https://ncm.pcram.net/taxs.php", {
        headers: {
          Cookie: sessionCookie,
          "User-Agent": "Mozilla/5.0 (compatible)",
        },
        cache: "no-store",
      }),
    ]);

    let taxEntries: TaxEntry[] = [];
    if (taxRes.ok) {
      try {
        taxEntries = await taxRes.json();
      } catch {
        // ignore parse errors, proceed without tax data
      }
    }

    const taxMap = new Map<string, TaxEntry>(
      taxEntries.map((t) => [t.position.toUpperCase(), t])
    );

    const results = parseNcmTable(html, taxMap);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
