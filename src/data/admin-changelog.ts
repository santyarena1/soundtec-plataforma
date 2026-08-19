import type { ChangelogItem } from "@/lib/changelog";

/**
 * Fuente de las novedades del panel admin (solo lectura en la UI).
 * Un push = una entrada. El mismo día se muestra agrupado en una sola tarjeta.
 * El deploy las publica solas. No reutilizar un id viejo para forzar popup.
 */
export type ShippedChangelogEntry = {
  id: string;
  version: string;
  releasedAt: string;
  summary: string;
  items: ChangelogItem[];
};

export const SHIPPED_ADMIN_CHANGELOG: ShippedChangelogEntry[] = [
  {
    id: "changelog-bootstrap-v1",
    version: "1.0",
    releasedAt: "2026-08-19T14:00:00.000Z",
    summary:
      "Márgenes y descuentos se pueden aplicar a varias marcas o clientes a la vez, y se editan de a una o todas juntas.",
    items: [
      {
        kind: "NUEVO",
        text: "Una regla agrupada: tildás varias marcas o clientes y queda 1 regla con subreglas.",
      },
      {
        kind: "NUEVO",
        text: "Editar esta cambia una sola subregla. Editar todo actualiza el grupo entero.",
      },
      {
        kind: "MEJORA",
        text: "Buscador en vivo al elegir marca, cliente o producto.",
      },
      {
        kind: "MEJORA",
        text: "Markup se carga tal cual: 2,75 = costo × 2,75. El 1 no se suma.",
      },
      {
        kind: "MEJORA",
        text: "Las reglas muestran fecha de alta y se pueden editar después de crearlas.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-changelog",
    version: "1.1",
    releasedAt: "2026-08-19T15:10:00.000Z",
    summary: "El admin tiene un changelog: historial de versiones y un aviso cuando hay algo nuevo.",
    items: [
      {
        kind: "NUEVO",
        text: "Botón Changelog arriba del dólar, en el menú izquierdo.",
      },
      {
        kind: "NUEVO",
        text: "Popup por usuario la primera vez que hay una novedad. El portal del cliente no lo ve.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-markup20",
    version: "1.2",
    releasedAt: "2026-08-19T15:22:00.000Z",
    summary: "Ya se puede guardar un markup alto (por ejemplo ×20) sin que se rompa la pantalla.",
    items: [
      {
        kind: "FIX",
        text: "Crear una regla con markup ×20 (u otro valor alto) ya no tira el error genérico de Server Components.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-changelog-sync",
    version: "1.3",
    releasedAt: "2026-08-19T15:24:00.000Z",
    summary: "Las novedades se publican solas con cada push. No hace falta cargarlas a mano.",
    items: [
      {
        kind: "NUEVO",
        text: "Cada deploy sincroniza el changelog desde el código. Si hay una entrada nueva, el popup aparece a cada usuario del admin hasta que toca Entendido.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-changelog-readonly",
    version: "1.4",
    releasedAt: "2026-08-19T15:25:00.000Z",
    summary: "El changelog ya no se puede editar, borrar ni cargar a mano. Solo se actualiza con cada push.",
    items: [
      {
        kind: "MEJORA",
        text: "La pantalla Changelog es solo lectura. Las novedades las carga el deploy, no hay formulario ni botón de borrar.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-2",
    version: "2026.08.19",
    releasedAt: "2026-08-19T15:32:00.000Z",
    summary: "Al guardar una regla de precio ya no debería caerse la pantalla con el error genérico del servidor.",
    items: [
      {
        kind: "FIX",
        text: "Guardar márgenes o descuentos (también agrupados o con markup alto) deja de tirar el Application error al refrescar.",
      },
    ],
  },
];
