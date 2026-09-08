import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnóstico: prueba si crestron.com responde desde el entorno de ejecución
 * (Vercel bloquea o no según IP/headers). Admin-only.
 *   GET /api/admin/sync/crestron-web/probe?id=6511816
 */
const VARIANTS: Array<{ name: string; headers: Record<string, string> }> = [
  {
    name: "chrome-full",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Cache-Control": "max-age=0",
    },
  },
  {
    name: "plain",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html",
    },
  },
  {
    name: "curl",
    headers: { "User-Agent": "curl/8.4.0", Accept: "*/*" },
  },
];

async function probe(url: string, headers: Record<string, string>) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, redirect: "manual", cache: "no-store" });
    const body = await res.text().catch(() => "");
    return {
      status: res.status,
      location: res.headers.get("location"),
      server: res.headers.get("server"),
      via: res.headers.get("via"),
      cfRay: res.headers.get("cf-ray"),
      akamai: res.headers.get("x-akamai-request-id") ?? res.headers.get("x-reference-error"),
      bodyHead: body.replace(/\s+/g, " ").slice(0, 220),
      ms: Date.now() - started,
    };
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
  }
}

export async function GET(req: NextRequest) {
  await requireAdmin();
  const id = req.nextUrl.searchParams.get("id") ?? "6511816";
  const targets = [
    `https://www.crestron.com/model/${id}`,
    "https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/Rack-Mount/CP4",
    "https://www.crestron.com/handlers/search_v2.ashx?q=CP4&quicksearch=true",
    "https://www.crestron.com/Handlers/ResourceHandler.ashx?dID=21638",
  ];
  const results: Record<string, unknown> = {};
  for (const variant of VARIANTS) {
    results[variant.name] = await Promise.all(
      targets.map(async (url) => ({ url, ...(await probe(url, variant.headers)) }))
    );
  }
  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? null,
    results,
  });
}
