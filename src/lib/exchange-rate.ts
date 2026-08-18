import { getSetting } from "@/lib/settings";

type ExchangeRateSource = "oficial" | "blue" | "mep";

type CachedRate = {
  rate: number;
  expiresAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<ExchangeRateSource, CachedRate>();
const inFlight = new Map<ExchangeRateSource, Promise<number>>();

function validSource(value: string): ExchangeRateSource {
  return value === "oficial" || value === "mep" ? value : "blue";
}

async function fallbackRate(): Promise<number> {
  try {
    const parsed = Number(await getSetting("pricing.tc", "1"));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch {
    return 1;
  }
}

export async function getExchangeRate(): Promise<number> {
  let source: ExchangeRateSource = "blue";
  try {
    source = validSource(await getSetting("pricing.tc_source", "blue"));
  } catch {
    // El origen por defecto sigue siendo blue si la configuración no está disponible.
  }

  const cached = cache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const pending = inFlight.get(source);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetch("https://api.bluelytics.com.ar/v2/latest", {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Bluelytics HTTP ${response.status}`);
      const payload = await response.json() as Record<string, { value_sell?: unknown } | undefined>;
      const rate = Number(payload[source]?.value_sell);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("Cotización inválida");
      cache.set(source, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
      return rate;
    } catch {
      const rate = await fallbackRate();
      cache.set(source, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
      return rate;
    } finally {
      inFlight.delete(source);
    }
  })();

  inFlight.set(source, request);
  return request;
}
