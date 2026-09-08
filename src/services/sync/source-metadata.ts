import { Prisma } from "@prisma/client";

/** Conserva la metadata de otras fuentes y actualiza sólo la clave recibida. */
export function mergeSourceMetadata(
  existing: unknown,
  raw: unknown,
  rawKey?: string
): Prisma.InputJsonValue | undefined {
  if (raw == null) return undefined;
  if (!rawKey) return raw as Prisma.InputJsonValue;
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return { ...base, [rawKey]: raw } as Prisma.InputJsonValue;
}
