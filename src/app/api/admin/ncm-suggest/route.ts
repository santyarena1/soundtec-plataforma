import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestNcmPosition } from "@/services/openai";
import type { NcmResult } from "@/app/api/admin/ncm-search/route";

function extractKeywords(name: string): string {
  const stopWords = new Set(["con", "de", "del", "la", "el", "los", "las", "para", "por", "en", "y", "o", "a", "al"]);
  const words = name
    .normalize("NFD").replace(/\p{M}/gu, "")
    .split(/[\s\-\/,]+/)
    .map(w => w.trim())
    .filter(w => {
      if (w.length < 3) return false;
      if (stopWords.has(w.toLowerCase())) return false;
      if (/^[A-Z0-9]{2,}$/.test(w)) return false; // skip model numbers like GX5, SM7B
      return true;
    });
  return words.slice(0, 2).join(" ") || name.split(" ").slice(0, 2).join(" ");
}

async function searchPcram(q: string): Promise<NcmResult[]> {
  try {
    const htmlRes = await fetch(`https://ncm.pcram.net/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
      cache: "no-store",
    });
    if (!htmlRes.ok) return [];

    const setCookie = htmlRes.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.split(";")[0];

    const [html, taxRes] = await Promise.all([
      htmlRes.text(),
      fetch("https://ncm.pcram.net/taxs.php", {
        headers: { Cookie: sessionCookie, "User-Agent": "Mozilla/5.0 (compatible)" },
        cache: "no-store",
      }),
    ]);

    interface TaxEntry { position: string; aec: string; die: string; te: string; re: string; de: string; simi: string; }
    let taxEntries: TaxEntry[] = [];
    if (taxRes.ok) {
      try { taxEntries = await taxRes.json(); } catch { /* ignore */ }
    }
    const taxMap = new Map(taxEntries.map(t => [t.position.toUpperCase(), t]));

    function stripHtml(h: string) { return h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
    function parseDieNumber(die?: string | null) {
      if (!die) return null;
      const n = parseFloat(die.replace(",", ".").replace("%", ""));
      return isNaN(n) ? null : n;
    }

    const results: NcmResult[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cm;
      while ((cm = cellRegex.exec(rowMatch[1])) !== null) cells.push(stripHtml(cm[1]));
      if (cells.length < 2) continue;
      const position = cells[0].trim();
      const description = cells[1].replace(/\s+/g, " ").trim();
      if (!position || !/^\d[\d.]+/.test(position) || !description) continue;
      const isLeaf = /[A-Z]$/.test(position);
      const tax = isLeaf ? taxMap.get(position.replace(/\./g, "").toUpperCase()) : undefined;
      results.push({ position, description, isLeaf, aec: tax?.aec ?? null, die: tax?.die ?? null, te: tax?.te ?? null, simi: tax?.simi ?? null, re: tax?.re ?? null, de: tax?.de ?? null, dieNumber: parseDieNumber(tax?.die), aecNumber: parseDieNumber(tax?.aec), teNumber: parseDieNumber(tax?.te) });
    }
    return results;
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await req.json() as { productId: string };
  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, normalizedName: true, shortDescription: true, internalSku: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const query = extractKeywords(product.normalizedName);
  const allResults = await searchPcram(query);
  const leafCandidates = allResults.filter(r => r.isLeaf).slice(0, 12);

  if (leafCandidates.length === 0) {
    return NextResponse.json({ suggestion: null, query, reason: "no_pcram_results" });
  }

  const suggestion = await suggestNcmPosition({
    productName: product.normalizedName,
    description: product.shortDescription,
    candidates: leafCandidates.map(c => ({ position: c.position, description: c.description, die: c.die, aec: c.aec })),
  });

  return NextResponse.json({ suggestion, query, candidatesCount: leafCandidates.length });
}
