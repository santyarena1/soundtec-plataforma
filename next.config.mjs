import { readFileSync } from "node:fs";

/** Misma lista que usa lib/image-url: solo esos dominios pasan por el optimizador. */
const imageHosts = JSON.parse(readFileSync(new URL("./src/lib/image-hosts.json", import.meta.url), "utf8")).hosts;

const isDev = process.env.NODE_ENV !== "production";

/**
 * Política de contenido: qué puede cargar el navegador. Los scripts inline los
 * necesita Next (sin nonce); lo externo permitido es lo que el sitio usa de verdad:
 * visor 3D (jsDelivr), cotización del dólar (bluelytics) y videos (YouTube/Vimeo).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: blob: data:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https", hostname })),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Chromium para HTML→PDF de cotizaciones (no empaquetar en el bundle de webpack).
  // serverExternalPackages es de Next 15; en 14 la clave vive en experimental.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    /**
     * El binario de Chromium viene como archivos sueltos dentro del paquete y
     * el rastreo de dependencias no los ve, así que la función se desplegaba
     * sin ellos y generar el PDF fallaba con «the input directory does not
     * exist». Se incluyen a mano en las rutas que arman documentos.
     */
    outputFileTracingIncludes: {
      "/api/admin/quotes/[id]/preview-pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/quotes/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/portal/requests/[id]/quote-pdf/[quoteId]": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/admin/quotes/[id]": ["./node_modules/@sparticuz/chromium/bin/**", "./data/servicios/**"],
      "/admin/requests/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/admin/quotes/quick": ["./node_modules/@sparticuz/chromium/bin/**", "./data/servicios/**"],
      // Árbol de Tango y propuestas de reclasificación (se leen con fs al cargarlas).
      "/admin/products/reclasificacion": ["./data/tango/**"],
      "/admin/products/servicios": ["./data/servicios/**", "./data/tango/**"],
    },
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // La configuración se unificó bajo /admin/settings/*; estas rutas quedaron por links guardados.
  async redirects() {
    return [
      { source: "/admin/branding", destination: "/admin/settings/branding", permanent: false },
      { source: "/admin/api-keys", destination: "/admin/settings/integrations", permanent: false },
      { source: "/admin/ai", destination: "/admin/settings/ai", permanent: false },
      { source: "/admin/quotes/config", destination: "/admin/settings/quotes", permanent: false },
      { source: "/admin/users/roles", destination: "/admin/settings/roles", permanent: false },
    ];
  },
};

export default nextConfig;
