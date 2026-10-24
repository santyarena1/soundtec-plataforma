import { getSetting, setSetting } from "@/lib/settings";

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

/**
 * Si falla la consulta: el dólar de respaldo cargado a mano y, si no hay, el
 * último valor que funcionó. Antes caía a 1 y los precios en pesos salían 1:1.
 */
async function fallbackRate(): Promise<number> {
  try {
    for (const key of ["pricing.tc", "pricing.tc_last"]) {
      const parsed = Number(await getSetting(key, ""));
      if (Number.isFinite(parsed) && parsed > 1) return parsed;
    }
  } catch (error) {
    console.error("[exchange-rate] no se pudo leer el dólar de respaldo", error);
  }
  console.error("[exchange-rate] sin dólar: falló la consulta y no hay respaldo cargado");
  return 1;
}

let lastSaved = 0;
async function rememberRate(rate: number) {
  // Se guarda como respaldo, a lo sumo una vez por hora.
  if (Date.now() - lastSaved < 3_600_000) return;
  lastSaved = Date.now();
  try {
    await setSetting("pricing.tc_last", String(rate), { description: "Último dólar que funcionó (respaldo automático)." });
  } catch (error) {
    console.error("[exchange-rate] no se pudo guardar el respaldo", error);
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
      void rememberRate(rate);
      return rate;
    } catch (error) {
      console.error("[exchange-rate] falló la consulta del dólar", error);
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
