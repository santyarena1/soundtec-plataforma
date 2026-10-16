/** Opciones de los datos de un cliente (compartidas por formularios y servidor). */

export const TAX_CONDITIONS = ["Responsable inscripto", "Monotributo", "Exento", "Consumidor final", "No responsable"] as const;

export const CLIENT_SEGMENTS = ["Integrador", "Instalador", "Corporativo", "Educación", "Residencial", "Gobierno", "Rental", "Retail", "Hotelería", "Salud", "Culto"] as const;

export const PROVINCES = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy",
  "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz",
  "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
] as const;
