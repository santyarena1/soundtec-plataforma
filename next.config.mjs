/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // Chromium para HTML→PDF de cotizaciones (no empaquetar en el bundle de webpack).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.vercel-storage.com https://*.blob.vercel-storage.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
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
