/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
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
