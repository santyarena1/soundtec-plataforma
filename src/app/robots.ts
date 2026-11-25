import type { MetadataRoute } from "next";

/** Catálogo público indexable; enlaces privados (listas, formularios, proyectos, activación) y paneles, no. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/portal", "/api", "/lista", "/f/", "/p/", "/e/", "/activar", "/restablecer", "/baja", "/cuenta", "/ver-como", "/salir", "/dev-harness"],
      },
    ],
  };
}
