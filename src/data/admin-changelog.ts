import type { ChangelogItem } from "@/lib/changelog";

/**
 * Fuente de las novedades del panel admin (solo lectura en la UI).
 * Un push = una entrada = un bump vX.X.X.
 *   X = cambio grande, Y = novedad/mejora visible, Z = mini-fix.
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
    version: "1.0.0",
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
    version: "1.1.0",
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
    version: "1.2.0",
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
    version: "1.3.0",
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
    version: "1.4.0",
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
    version: "1.4.1",
    releasedAt: "2026-08-19T15:32:00.000Z",
    summary: "Al guardar una regla de precio ya no debería caerse la pantalla con el error genérico del servidor.",
    items: [
      {
        kind: "FIX",
        text: "Guardar márgenes o descuentos (también agrupados o con markup alto) deja de tirar el Application error al refrescar.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-3",
    version: "1.5.0",
    releasedAt: "2026-08-19T16:10:00.000Z",
    summary: "Antes de guardar una regla podés previsualizar los productos y exceptuar algunos.",
    items: [
      {
        kind: "NUEVO",
        text: "Botón Previsualizar: lista los productos de la regla, con buscador, todos tildados.",
      },
      {
        kind: "NUEVO",
        text: "Destildar un producto lo saca de esa regla (queda una subregla de excepción) y cae al markup o descuento que le corresponda.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-4",
    version: "1.5.1",
    releasedAt: "2026-08-19T16:25:00.000Z",
    summary: "La previsualización de una regla se puede ver en tarjetas o lista, con la foto de cada producto.",
    items: [
      {
        kind: "MEJORA",
        text: "Previsualizar productos: interruptor Tarjetas / Lista y se ve la foto de catálogo.",
      },
    ],
  },
  {
    id: "ship-2026-08-19-5",
    version: "1.5.2",
    releasedAt: "2026-08-19T16:35:00.000Z",
    summary: "El popup de novedades queda en esta computadora: si tocás Entendido, no vuelve a salir acá aunque entre otro usuario.",
    items: [
      {
        kind: "MEJORA",
        text: "El aviso de changelog es por PC (este navegador), no por usuario. En otra computadora sí vuelve a aparecer.",
      },
    ],
  },
  {
    id: "ship-2026-08-23",
    version: "1.5.3",
    releasedAt: "2026-08-23T00:55:00.000Z",
    summary: "El catálogo muestra la foto aunque nadie haya marcado una imagen como principal, y el título del producto ya no se corta con puntos suspensivos.",
    items: [
      {
        kind: "FIX",
        text: "Si un artículo tiene fotos (subidas, Serper o viejas) pero ninguna marcada como principal, el listado ya no dice Sin imagen. Ejemplo: IVA-CMT-BRKTJ-1B.",
      },
      {
        kind: "MEJORA",
        text: "El nombre del producto en el catálogo se muestra completo, sin cortar con ….",
      },
    ],
  },
  {
    id: "ship-2026-08-23-2",
    version: "1.6.0",
    releasedAt: "2026-08-23T01:15:00.000Z",
    summary: "Las versiones del admin pasan a vX.X.X: el tercer número es para los mini-fix.",
    items: [
      {
        kind: "NUEVO",
        text: "Cada push tiene versión semver. Mini-fix = v1.5.3 (parche). Novedad visible = v1.6.0 (menor).",
      },
      {
        kind: "MEJORA",
        text: "El changelog lista cada versión por separado (ya no junta todo el día) y arriba se ve la versión actual.",
      },
      {
        kind: "FIX",
        text: "El arreglo de fotos y títulos del catálogo quedó documentado como v1.5.3 (FIX), no como fecha.",
      },
    ],
  },
  {
    id: "ship-2026-08-23-3",
    version: "1.6.1",
    releasedAt: "2026-08-23T01:20:00.000Z",
    summary: "En las tarjetas del catálogo el título usa todo el ancho y ocupa siempre 3 líneas, para que no queden de distinto tamaño.",
    items: [
      {
        kind: "FIX",
        text: "El nombre ya no se aprieta al lado del favorito: va a lo ancho de la card. Siempre reserva 3 líneas (si sobra, quedan vacías).",
      },
    ],
  },
  {
    id: "ship-2026-08-28",
    version: "1.6.2",
    releasedAt: "2026-08-28T03:20:00.000Z",
    summary:
      "Si el producto tiene la familia escrita pero el subrubro vacío, ya toma la regla de márgenes en vez del ×1,35.",
    items: [
      {
        kind: "FIX",
        text: "El motor matchea la familia por nombre (Bracket, Accessory, CCA Series…) cuando el subrubro no está vinculado. Antes caía al default ×1,35.",
      },
      {
        kind: "MEJORA",
        text: "En Cadena de precios se ve si aplicó una regla, el COEF VTA o el default ×1,35.",
      },
    ],
  },
  {
    id: "ship-2026-08-28-2",
    version: "1.7.0",
    releasedAt: "2026-08-28T03:25:00.000Z",
    summary:
      "Cotizaciones renovadas: marcas por logo, variantes de texto, planilla más clara, preview de IA y deshacer cambios.",
    items: [
      {
        kind: "NUEVO",
        text: "Marcas en el PDF: collage institucional o logos individuales por marca, con biblioteca en Configuración → Cotizaciones → Biblioteca de marcas.",
      },
      {
        kind: "NUEVO",
        text: "En el paso Módulos podés elegir variantes de texto (Disciplinas, Intro corporativa, Instalación) definidas en Configuración → Variantes de texto.",
      },
      {
        kind: "NUEVO",
        text: "La IA muestra preview antes de aplicar cambios en módulos e ítems. Panel flotante de historial con Deshacer.",
      },
      {
        kind: "NUEVO",
        text: "Modo enfoque en el editor: oculta el menú lateral para trabajar solo en el documento.",
      },
      {
        kind: "MEJORA",
        text: "Planilla de productos: filtro de filas, ambientes colapsables, búsqueda con marca/categoría/SKU y refresh al agregar del catálogo.",
      },
      {
        kind: "MEJORA",
        text: "Pasos del wizard renombrados (Módulos, Productos…) y pantalla de nueva COT simplificada.",
      },
      {
        kind: "FIX",
        text: "Generar propuesta refresca el documento; la vista ampliada ya no se cierra sola al editar.",
      },
    ],
  },
  {
    id: "ship-2026-08-28-3",
    version: "1.7.1",
    releasedAt: "2026-08-28T03:35:00.000Z",
    summary:
      "Si un producto usa el margen general se avisa en la ficha, y Guardar queda fijo abajo.",
    items: [
      {
        kind: "MEJORA",
        text: "Cadena de precios avisa en amarillo cuando no hay regla y aplica el markup general (×1,35).",
      },
      {
        kind: "MEJORA",
        text: "En la ficha del producto el botón Guardar queda flotante y siempre visible.",
      },
    ],
  },
  {
    id: "ship-2026-08-28-4",
    version: "1.8.0",
    releasedAt: "2026-08-28T16:40:00.000Z",
    summary:
      "Las fichas Crestron se pueden enriquecer desde el catálogo público: foto, texto, specs y link oficial.",
    items: [
      {
        kind: "NUEVO",
        text: "En Sync Crestron, botón Enriquecer fichas: busca el modelo en crestron.com y completa foto, descripción, especificaciones y URL.",
      },
      {
        kind: "MEJORA",
        text: "El sync de precios asigna marca CRESTRON y el número de modelo. No pisa textos o fotos que ya estaban, salvo que tildes Forzar.",
      },
    ],
  },
  {
    id: "ship-2026-09-04",
    version: "1.9.0",
    releasedAt: "2026-09-04T00:45:00.000Z",
    summary:
      "En sincronización de productos: historial de cambios por producto y botón para volver a la sync anterior.",
    items: [
      {
        kind: "NUEVO",
        text: "Procesos recientes: Historial con cambios campo por campo (antes → después).",
      },
      {
        kind: "NUEVO",
        text: "Revertir una sync aplicada restaura productos al estado anterior; los creados se desactivan.",
      },
      {
        kind: "MEJORA",
        text: "“Actualizados” solo cuenta cambios reales. El resto aparece en “Sin cambios” (ya no infla 900+ updates).",
      },
    ],
  },
  {
    id: "ship-2026-08-29",
    version: "1.10.0",
    releasedAt: "2026-08-29T02:10:00.000Z",
    summary:
      "La IA deja equipos como sugerencias en Productos y también redacta «Nuestra propuesta» si generás desde una solicitud.",
    items: [
      {
        kind: "MEJORA",
        text: "Generar propuesta ya no vuelca equipos a la planilla: quedan como sugerencias para aprobar o elegir a mano.",
      },
      {
        kind: "FIX",
        text: "Al aprobar una sugerencia, el precio es el del motor (el mismo que al agregar del catálogo).",
      },
      {
        kind: "FIX",
        text: "Desde una solicitud, «Nuestra propuesta» se genera en Productos, no solo si tocás Generar al principio.",
      },
    ],
  },
  {
    id: "ship-2026-09-04",
    version: "1.10.0",
    releasedAt: "2026-09-04T00:40:00.000Z",
    summary:
      "El catálogo abre mucho más rápido y se arregló el ícono de pestaña (page icon) que 404aba o metía el logo gigante en el HTML.",
    items: [
      {
        kind: "FIX",
        text: "Calcular precios del catálogo ya no pide las reglas de margen/descuento una vez por producto (miles de queries).",
      },
      {
        kind: "FIX",
        text: "En Admin → Productos, el listado Crestron ya no se carga cuando estás en el tab Catálogo.",
      },
      {
        kind: "FIX",
        text: "El page icon usa favicon.ico / icon.svg fijos. El logo en data: ya no se mete en el HTML de todas las páginas.",
      },
    ],
  },
];
