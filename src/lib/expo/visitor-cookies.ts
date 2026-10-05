/** Cookies del visitante del catálogo público (httpOnly, 1 año). */
export const VISITOR_COOKIE = "st_vid";
export const QR_COOKIE = "st_qr";
export const LEAD_COOKIE = "st_lead";
export const SKIP_COOKIE = "st_skip";

export const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 365 * 24 * 3600,
};
