/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
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
      "/admin/quotes/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/admin/requests/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/admin/quotes/quick": ["./node_modules/@sparticuz/chromium/bin/**"],
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
