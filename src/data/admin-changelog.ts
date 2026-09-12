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
    id: "ship-2026-09-04-2",
    version: "1.11.0",
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
  {
    id: "ship-2026-09-04-3",
    version: "1.11.1",
    releasedAt: "2026-09-04T00:50:00.000Z",
    summary: "Se corrigió el build de Vercel que rompía el deploy del catálogo más rápido.",
    items: [
      {
        kind: "FIX",
        text: "Admin → Productos: tipado del tab Crestron vs Catálogo para que compile el deploy.",
      },
    ],
  },
  {
    id: "ship-2026-09-04-4",
    version: "1.11.2",
    releasedAt: "2026-09-04T03:50:00.000Z",
    summary:
      "Sync Sonance: el costo FOB ahora toma My Price del dealer, no el wholesale de catálogo.",
    items: [
      {
        kind: "FIX",
        text: "Antes se usaba basicListPrice (wholesale). Ahora se usa pricing.unitNetPrice (My Price en my.sonance.com).",
      },
    ],
  },
  {
    id: "ship-2026-09-04-5",
    version: "1.11.3",
    releasedAt: "2026-09-04T04:15:00.000Z",
    summary:
      "Sonance trae el My Price real (ej. 768 vs wholesale 960) y el favicon deja de romperse en producción.",
    items: [
      {
        kind: "FIX",
        text: "My Price sale de POST /api/v1/realtimepricing (unitNetPrice). Ya no se usa unitListPrice/wholesale como fallback.",
      },
      {
        kind: "FIX",
        text: "El favicon ya no apunta a localhost cuando falta APP_URL; hay favicon multi-tamaño e ícono Apple.",
      },
      {
        kind: "MEJORA",
        text: "En Cadena de precios, el resumen dice «Precio FOB USD» (venta) para no confundirlo con el costo base.",
      },
    ],
  },
  {
    id: "ship-2026-09-08-1",
    version: "1.12.0",
    releasedAt: "2026-09-08T03:30:00.000Z",
    summary:
      "Enriquecimiento Crestron desde crestron.com: fichas completas con specs, imágenes HD, documentos, accesorios e incluidos.",
    items: [
      {
        kind: "NUEVO",
        text: "Admin → Sincronización: nueva fuente «Crestron.com — enriquecimiento». Cruza por material number y trae descripción, key features, tabla de specs, dimensiones y peso, galería 2500px, badges, documentos (spec sheet, manuales, CAD, Revit, firmware) y modelo regulatorio.",
      },
      {
        kind: "NUEVO",
        text: "Relaciones nuevas entre productos: «Incluido en la caja» (con cantidad), «Otros modelos de esta línea» y «Productos relacionados». Se ven en la ficha del portal.",
      },
      {
        kind: "NUEVO",
        text: "Los productos discontinuados por Crestron muestran un badge en la ficha.",
      },
      {
        kind: "MEJORA",
        text: "Precio y stock siguen viniendo solo de Xtrabon: el enriquecimiento no los toca y no pisa el nombre del producto.",
      },
    ],
  },
  {
    id: "ship-2026-09-08-2",
    version: "1.12.1",
    releasedAt: "2026-09-08T12:00:00.000Z",
    summary: "Listas e importación quedó más simple y segura: unificamos la configuración y evitamos pisar contenido ya trabajado.",
    items: [
      { kind: "MEJORA", text: "Sincronización reúne las credenciales, el destino de categorías y las traducciones de Crestron y Sonance." },
      { kind: "MEJORA", text: "Importar Excel permite filtrar las listas y reutiliza automáticamente los perfiles de mapeo compatibles." },
      { kind: "FIX", text: "Al actualizar productos existentes se conservan nombres y descripciones; sólo cambian los datos operativos que corresponden." },
      { kind: "MEJORA", text: "Las herramientas clásicas siguen disponibles como respaldo, fuera del menú principal y con una advertencia clara." },
    ],
  },
  {
    id: "ship-2026-09-08-4",
    version: "1.12.2",
    releasedAt: "2026-09-08T18:00:00.000Z",
    summary: "Márgenes y descuentos ahora muestran la cobertura completa por producto.",
    items: [
      { kind: "NUEVO", text: "La pestaña «Por producto» separa los productos con regla y sin regla, con búsqueda, filtros y vista por cliente." },
      { kind: "NUEVO", text: "Desde cada producto podés crear, revisar, editar, desactivar o quitar reglas y sus grupos." },
      { kind: "MEJORA", text: "La selección múltiple permite aplicar una regla a varios productos de una sola vez." },
    ],
  },
  {
    id: "ship-2026-09-08-3",
    version: "1.13.0",
    releasedAt: "2026-09-08T15:00:00.000Z",
    summary: "Clientes y usuarios ahora se gestionan con un CRM claro y unificado.",
    items: [
      { kind: "NUEVO", text: "La ficha del cliente reúne contactos, actividad, solicitudes, cotizaciones, cuenta corriente, precios y visibilidad." },
      { kind: "NUEVO", text: "Los clientes pueden existir sin acceso al portal y tener varios contactos y usuarios." },
      { kind: "MEJORA", text: "La gestión de usuarios permite generar contraseñas temporales, vincular clientes y conservar el historial al desactivar." },
    ],
  },
{
    id: "ship-2026-09-08-5",
    version: "1.13.1",
    releasedAt: "2026-09-08T18:00:00.000Z",
    summary: "Listas compartibles operativas, reportes de IA detallados y cotizaciones rápidas.",
    items: [
      { kind: "NUEVO", text: "Las listas compartibles suman selección bajo demanda, acciones de envío, vistas y cotización directa." },
      { kind: "MEJORA", text: "Los reportes de descripciones IA guardan motivos, comentario y el texto que vio el cliente." },
      { kind: "NUEVO", text: "Cotización rápida permite armar, guardar o emitir una propuesta desde una sola pantalla." },
    ],
  },
  {
    id: "ship-2026-09-08-6",
    version: "1.14.0",
    releasedAt: "2026-09-08T19:00:00.000Z",
    summary: "Las solicitudes pasan a llamarse Pedidos en todo el sistema (portal y admin).",
    items: [
      { kind: "MEJORA", text: "Pedido = lo que arma y envía el cliente; Cotización = lo que responde Soundtec. Cambia solo el nombre: los pedidos existentes, sus estados y sus links siguen iguales." },
      { kind: "MEJORA", text: "Los estados se leen en masculino (Enviado, Respondido, Confirmado). El tipo de pedido «Pedido» ahora se llama «Compra»." },
    ],
  },
  {
    id: "ship-2026-09-10-1",
    version: "1.14.1",
    releasedAt: "2026-09-10T01:30:00.000Z",
    summary: "El PDF de cotización rápida (y de cualquier emisión) usa el mismo diseño tipográfico que la cotización común.",
    items: [
      {
        kind: "FIX",
        text: "Al emitir (incluida la cotización rápida) el PDF ya no sale en texto plano: se genera desde el mismo HTML que Vista/Word (logo, tablas, secciones).",
      },
      {
        kind: "MEJORA",
        text: "Word y PDF comparten un único builder de documento; la cotización rápida sigue siendo más básica en contenido, pero con el mismo diseño.",
      },
    ],
  },
  {
    id: "ship-2026-09-12",
    version: "1.15.0",
    releasedAt: "2026-09-12T14:00:00.000Z",
    summary: "Paseo de bienvenida la primera vez que entra un usuario nuevo (admin o portal).",
    items: [
      {
        kind: "NUEVO",
        text: "Al dar de alta un usuario, la primera visita abre un tutorial guiado por módulos de gestión, ventas, clientes y catálogo.",
      },
      {
        kind: "NUEVO",
        text: "El progreso queda guardado por usuario; se puede saltar, retomar o reiniciar desde Ayuda → Empezar guía de nuevo.",
      },
      {
        kind: "MEJORA",
        text: "Cada paso explica qué se edita y qué otras pantallas afecta (precios, visibilidad, modo cliente/admin).",
      },
    ],
  },
  {
    id: "ship-2026-09-12-2",
    version: "1.15.1",
    releasedAt: "2026-09-12T15:10:00.000Z",
    summary: "En Ayuda hay un botón claro para reiniciar la guía, y el changelog ya no pisa el onboarding.",
    items: [
      {
        kind: "FIX",
        text: "Ayuda → «Empezar guía de nuevo» reinicia el paseo desde cero aunque lo hayas cerrado o saltado.",
      },
      {
        kind: "FIX",
        text: "El popup de novedades no se abre encima del paseo; el fondo del onboarding ya no lo cierra de un click accidental.",
      },
    ],
  },
  {
    id: "ship-2026-09-12-3",
    version: "1.15.2",
    releasedAt: "2026-09-12T15:30:00.000Z",
    summary: "Tutorial guiado más completo: vos navegás, el sistema te explica cada módulo en detalle.",
    items: [
      {
        kind: "FIX",
        text: "El botón Siguiente ya no se traba: el tutorial no salta de pantalla solo ni bloquea el menú.",
      },
      {
        kind: "MEJORA",
        text: "Cada módulo (clientes, usuarios, catálogo, precios, visibilidad, listas compartibles, pedidos y cotizaciones) explica cómo crear y qué hace cada opción.",
      },
      {
        kind: "MEJORA",
        text: "Para cambiar de sección, el tutorial te indica qué clickear en el menú y espera a que lo hagas vos.",
      },
    ],
  },
  {
    id: "ship-2026-09-12-4",
    version: "1.15.3",
    releasedAt: "2026-09-12T16:00:00.000Z",
    summary: "El tutorial ya no se cae al avanzar, y en «tu turno» marca en ámbar qué tenés que clickear.",
    items: [
      {
        kind: "FIX",
        text: "Siguiente / guardar progreso ya no dispara el error genérico de cliente.",
      },
      {
        kind: "FIX",
        text: "En pasos «tu turno» se resalta el ítem del menú (borde ámbar) en lugar de oscurecer toda la pantalla sin foco.",
      },
      {
        kind: "MEJORA",
        text: "La tarjeta del tutorial se ubica al costado del resaltado para no tapar el control a clickear.",
      },
    ],
  },
  {
    id: "ship-2026-09-12-5",
    version: "1.16.0",
    releasedAt: "2026-09-12T18:30:00.000Z",
    summary:
      "Tutorial más profundo en productos, pedidos y cotizaciones: se entra a fichas existentes, se muestra el alta de cero y se aclara que el paseo no guarda cambios.",
    items: [
      {
        kind: "NUEVO",
        text: "En Productos el tutorial abre una ficha y explica qué es IA, qué viene de import/Excel y qué llega de páginas del proveedor.",
      },
      {
        kind: "NUEVO",
        text: "En Pedidos se entra a un pedido real: estados, ítems, respuesta, cotización vinculada y cómo nacen los pedidos desde el portal.",
      },
      {
        kind: "NUEVO",
        text: "En Cotizaciones se recorre una existente (asistente de 7 pasos) y las pantallas de alta completa y cotización rápida.",
      },
      {
        kind: "MEJORA",
        text: "Aviso permanente: durante el tutorial no hay que Guardar / Enviar / Emitir / Crear; si solo mirás, no se persiste nada.",
      },
    ],
  },
  {
    id: "ship-2026-09-12-6",
    version: "1.16.1",
    releasedAt: "2026-09-12T19:10:00.000Z",
    summary:
      "El tutorial ya no se traba al pasar de una ficha de producto/cotización a «crear de cero».",
    items: [
      {
        kind: "FIX",
        text: "Antes de «Nuevo producto» / «Nueva cotización» te pide volver al listado (el botón no está dentro de la ficha).",
      },
      {
        kind: "FIX",
        text: "El mensaje «Tu turno» ya no dice «abrí el menú» cuando hay que clickear un botón de la pantalla.",
      },
    ],
  },
];
