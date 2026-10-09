/** Rol de diseño y montaje probable de cualquier producto del catálogo. */

import type { DesignRole, MountOption } from "./types";

/** Rol de diseño a partir del perfil del producto (o de su tipo según la IA). */
export function roleForProduct(designRole: string | null | undefined, productType: string | null | undefined): DesignRole {
  if (designRole && designRole !== "furniture") return designRole as DesignRole;
  switch (productType) {
    case "speaker":
    case "subwoofer":
      return "speaker";
    case "display":
      return "display";
    case "camera":
      return "camera";
    case "microphone":
      return "mic";
    case "touchpanel":
      return "touch";
    case "amplifier":
    case "processor":
    case "control":
    case "switcher":
    case "network":
      return "processor";
    default:
      return "other";
  }
}

/** Montaje más probable para un rol (el usuario lo puede cambiar al agregarlo). */
export function defaultMountForRole(role: DesignRole): MountOption {
  switch (role) {
    case "speaker":
    case "mic":
      return "ceiling";
    case "display":
    case "camera":
    case "touch":
      return "wall";
    case "processor":
    case "codec":
      return "rack";
    default:
      return "table";
  }
}
