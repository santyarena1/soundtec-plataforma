import { z } from "zod";
import { isValidCuit, normalizeCuit } from "./cuit";

export const ACTIVITY_OPTIONS = [
  "Integración AV",
  "Instalaciones eléctricas",
  "Arquitectura y diseño",
  "Constructora o desarrolladora",
  "Venta de equipos",
  "Otra",
] as const;

const optional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const accountRequestSchema = z
  .object({
    fullName: z.string().trim().min(3, "Ingresá nombre y apellido").max(160),
    email: z.string().trim().toLowerCase().email("Mail inválido").max(200),
    phone: z.string().trim().min(6, "Ingresá un teléfono").max(60),
    company: z.string().trim().min(2, "Ingresá la empresa").max(200),
    cuit: z.string().trim().refine(isValidCuit, "CUIT inválido").transform(normalizeCuit),
    activity: z.enum(ACTIVITY_OPTIONS, { errorMap: () => ({ message: "Elegí la actividad" }) }),
    activityOther: optional(120),
    location: optional(160),
    website: optional(200),
    comment: optional(2000),
  })
  .refine((v) => v.activity !== "Otra" || !!v.activityOther, {
    message: "Contanos a qué se dedica la empresa",
    path: ["activityOther"],
  });

export type AccountRequestInput = z.infer<typeof accountRequestSchema>;
