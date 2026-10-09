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
  {
    id: "ship-2026-09-12-7",
    version: "1.16.2",
    releasedAt: "2026-09-12T23:15:00.000Z",
    summary: "El tutorial del portal habla solo de lo que ve el cliente, sin mencionar configuraciones internas.",
    items: [
      {
        kind: "FIX",
        text: "En el portal ya no se habla de márgenes, descuentos ni productos ocultos: solo catálogo, precios y pedidos como los ve el usuario.",
      },
    ],
  },
  {
    id: "ship-2026-09-12-8",
    version: "1.16.3",
    releasedAt: "2026-09-12T23:20:00.000Z",
    summary: "Al pasar a Modo cliente desde el tutorial del admin, el portal ofrece continuar la guía.",
    items: [
      {
        kind: "FIX",
        text: "Si el tutorial del panel te manda a Modo cliente, en el portal aparece un aviso para seguir la guía o volver al admin.",
      },
    ],
  },
  {
    id: "ship-2026-09-12-soundtube",
    version: "1.17.0",
    releasedAt: "2026-09-13T01:00:00.000Z",
    summary: "Nueva fuente SoundTube: catálogo completo de soundtube.com (SoundTube, Soundsphere, Phase Technology, Rockustics, dARTS y más).",
    items: [
      { kind: "NUEVO", text: "En Sincronización aparece SoundTube. Trae precio, stock, descripciones, imágenes, documentos, atributos y categoría de 596 productos, sin login." },
      { kind: "NUEVO", text: "El nivel de precio que se toma como costo (dealer o lista) se elige en Configuración de fuentes." },
      { kind: "MEJORA", text: "SoundTube entra en el cron semanal junto a Crestron y Sonance." },
    ],
  },
  {
    id: "ship-2026-10-01-codigos-y-lista-soundtube",
    version: "1.18.0",
    releasedAt: "2026-10-02T01:46:00.000Z",
    summary: "Los productos se llaman por su código y los precios de SoundTube se cargan desde el Excel de la lista.",
    items: [
      { kind: "NUEVO", text: "Sincronización → Nombres por código: el nombre pasa a ser el modelo en Sonance / BLAZE / JAMES / IPORT / TRUFIG y el SKU en las marcas de SoundTube. Muestra la lista antes de aplicar." },
      { kind: "NUEVO", text: "Sincronización → Lista de precios SoundTube: subís el Excel, SPRDIS US es el costo y MUP queda como regla de markup de cada producto." },
      { kind: "NUEVO", text: "Al subir la lista te marca los productos que quedan afuera y elegís dejarlos, desactivarlos o ponerles precio." },
      { kind: "MEJORA", text: "La clasificación del Excel (CATEGORIA, SEGMENTO, FAMILIA, TIPO) se puede aplicar con una casilla." },
      { kind: "MEJORA", text: "Desde que aplicás una lista, el sync de SoundTube ya no pisa los costos cargados por Excel." },
    ],
  },
  {
    id: "ship-2026-10-02-sonance-my-price",
    version: "1.18.1",
    releasedAt: "2026-10-02T12:00:00.000Z",
    summary: "Sonance vuelve a tomar el My Price (precio dealer) como costo, en vez del wholesale.",
    items: [
      { kind: "FIX", text: "El sync de Sonance trae el My Price de cada producto (ej. DSP 2-150 MKIII: 528 en vez de 660). Corré Sonance en Sincronización para actualizar los costos." },
      { kind: "MEJORA", text: "Si Sonance no devuelve el My Price, la sincronización queda como fallida en lugar de seguir con el costo viejo." },
    ],
  },
  {
    id: "ship-2026-10-02-logo-visible",
    version: "1.18.2",
    releasedAt: "2026-10-02T13:30:00.000Z",
    summary: "El logo vuelve a verse en el menú del admin, el portal y la web.",
    items: [
      { kind: "FIX", text: "El logo es blanco y desaparecía sobre las barras claras: ahora va sobre el color de la marca en todos lados, incluida la vista previa de Branding." },
    ],
  },
  {
    id: "ship-2026-10-expo-leads",
    version: "1.19.0",
    releasedAt: "2026-10-05T01:30:00.000Z",
    summary: "Experiencia Expo: QR con captura de leads, catálogo por marcas y pedido de cuenta de cliente.",
    items: [
      { kind: "NUEVO", text: "Configuración → Eventos y QR: creá eventos y sus QR, descargá el QR para imprimir, abrí la pantalla del stand (horizontal o vertical) y mirá escaneos, leads, cuentas pedidas y marcas más vistas. Leads descargables en Excel." },
      { kind: "NUEVO", text: "Quien escanea el QR deja su mail (obligatorio mientras el evento está vigente) y entra al catálogo." },
      { kind: "NUEVO", text: "El catálogo público arranca con la grilla de marcas y tiene una barra de marcas arriba para cambiar rápido." },
      { kind: "NUEVO", text: "CRM → Solicitudes de cuenta: el cliente la pide desde el catálogo con su CUIT; la aprobás y le mandás por WhatsApp el link para crear su contraseña (se puede regenerar). Si el CUIT ya es cliente, se vincula a ese cliente." },
      { kind: "MEJORA", text: "En las fichas de producto la descripción aparece primero, antes de las especificaciones técnicas." },
    ],
  },
  {
    id: "ship-2026-10-05-catalogo-relevancia",
    version: "1.20.0",
    releasedAt: "2026-10-05T14:00:00.000Z",
    summary: "El catálogo se ordena por los más relevantes, se puede ordenar por precio y el único filtro es la marca.",
    items: [
      { kind: "NUEVO", text: "Orden «Más relevantes» por defecto: según las fichas más vistas. Hasta juntar suficientes visitas muestra primero Crestron Home, de mayor a menor precio." },
      { kind: "NUEVO", text: "Orden por Mayor precio / Menor precio también en el catálogo público (sin mostrar los precios)." },
      { kind: "MEJORA", text: "Los filtros quedan solo por marca, en el catálogo público y en el portal." },
    ],
  },
  {
    id: "ship-2026-10-05-logos-marcas",
    version: "1.20.1",
    releasedAt: "2026-10-05T14:20:00.000Z",
    summary: "La grilla de marcas del catálogo muestra los logos que ya tenía la web.",
    items: [
      { kind: "MEJORA", text: "Crestron, SoundTube y BLAZE aparecen con su logo en la grilla y la barra de marcas. Las demás muestran el nombre hasta que cargues su logo en Admin → Marcas." },
    ],
  },
  {
    id: "ship-2026-10-05-marcas-arriba",
    version: "1.20.2",
    releasedAt: "2026-10-05T15:00:00.000Z",
    summary: "El catálogo arranca siempre por la grilla de marcas y la marca se elige arriba, sin barra lateral.",
    items: [
      { kind: "MEJORA", text: "Al entrar al catálogo (público o portal, celular o PC) aparece primero la grilla de marcas con «Ver todos»." },
      { kind: "MEJORA", text: "En PC la marca se elige en la barra de arriba; se sacó la barra lateral de filtros." },
    ],
  },
  {
    id: "ship-2026-10-05-qr-logo-pantalla",
    version: "1.21.0",
    releasedAt: "2026-10-05T17:00:00.000Z",
    summary: "QR con el logo de Soundtec al centro, nueva pantalla del stand y logos de marca subiendo el archivo.",
    items: [
      { kind: "NUEVO", text: "Los QR de expo salen en negro con el isotipo de Soundtec al centro (pantalla y PNG para imprimir)." },
      { kind: "NUEVO", text: "Pantalla del stand renovada: vidriera animada con productos destacados de cada marca (sin accesorios), cinta de logos y QR grande." },
      { kind: "NUEVO", text: "Admin → Marcas: subí el logo como archivo (PNG, JPG, SVG, WEBP, GIF o AVIF) o pegá la URL de una imagen; si la URL es una página web en vez de una imagen, te avisa." },
      { kind: "MEJORA", text: "Sonance, JAMES, IPORT y TRUFIG ya aparecen con su logo oficial en el catálogo." },
    ],
  },
  {
    id: "ship-2026-10-05-ocultar-marcas",
    version: "1.22.0",
    releasedAt: "2026-10-05T18:00:00.000Z",
    summary: "Desde Admin → Marcas podés ocultar una marca del catálogo.",
    items: [
      { kind: "NUEVO", text: "Columna «Catálogo» en Marcas: Ocultar / Mostrar. Una marca oculta y sus productos no aparecen en el catálogo público, el portal, la pantalla del stand ni en las respuestas del asistente. En el admin siguen visibles." },
      { kind: "FIX", text: "Un cliente con una marca oculta por visibilidad ya no la ve aunque la filtre a mano." },
    ],
  },
  {
    id: "ship-2026-10-05-pantalla-qr-centro",
    version: "1.22.1",
    releasedAt: "2026-10-05T19:00:00.000Z",
    summary: "Pantalla del stand con el QR al centro, QR en el azul de Soundtec y vidriera con productos elegidos por vos.",
    items: [
      { kind: "MEJORA", text: "El QR va al centro de la pantalla; en horizontal tiene una vidriera a cada lado y en vertical la vidriera queda abajo." },
      { kind: "MEJORA", text: "QR y logo de Soundtec en el azul del sistema (pantalla y PNG para imprimir)." },
      { kind: "NUEVO", text: "En cada evento, «Vidriera de la pantalla del stand»: buscá, agregá y ordená los productos que pasan. Sin elegir ninguno, sigue la selección automática." },
    ],
  },
  {
    id: "ship-2026-10-05-pantalla-encaja",
    version: "1.22.2",
    releasedAt: "2026-10-05T19:30:00.000Z",
    summary: "La pantalla del stand entra completa en cualquier monitor, horizontal o vertical.",
    items: [
      { kind: "FIX", text: "En monitores verticales o casi cuadrados la vidriera y la cinta de marcas ya no quedan cortadas abajo." },
    ],
  },
  {
    id: "ship-2026-10-05-logos-parejos",
    version: "1.22.3",
    releasedAt: "2026-10-05T20:30:00.000Z",
    summary: "Logos de marca parejos, pantalla del stand con logo grande y apertura en horizontal o vertical.",
    items: [
      { kind: "MEJORA", text: "Al subir un logo se recortan los márgenes vacíos y se ajusta a un tamaño común: todos se ven parejos. En Marcas, «Ajustar tamaño de todos los logos» hace lo mismo con los ya cargados." },
      { kind: "NUEVO", text: "En cada QR del evento: «Abrir horizontal» y «Abrir vertical» para elegir cómo se ve la pantalla del stand." },
      { kind: "MEJORA", text: "Pantalla del stand: logo de Soundtec casi a todo el ancho en vertical y fotos de productos más grandes en la vidriera." },
      { kind: "MEJORA", text: "En la barra de marcas del catálogo, las marcas con logo se muestran solo con el logo." },
    ],
  },
  {
    id: "ship-2026-10-05-pantalla-horizontal",
    version: "1.22.4",
    releasedAt: "2026-10-05T22:30:00.000Z",
    summary: "Pantalla del stand horizontal rediseñada y logos de marca parejos en todos lados.",
    items: [
      { kind: "MEJORA", text: "Pantalla del stand en horizontal, nueva: a la izquierda logo, título, QR grande y los pasos (escaneá, explorá, pedí tu cuenta); a la derecha la vidriera de productos en grande sobre fondo azul." },
      { kind: "MEJORA", text: "En vertical el logo de Soundtec queda un poco más chico." },
      { kind: "FIX", text: "Pantalla horizontal: en monitores muy anchos el logo ya no se superpone con el título." },
      { kind: "MEJORA", text: "Todos los logos de marca, también los cargados por URL, se recortan y se ajustan solos al mismo tamaño (catálogo, portal y pantalla del stand). Ya no hace falta tocar ningún botón." },
    ],
  },
  {
    id: "ship-2026-10-05-pantalla-vertical",
    version: "1.22.5",
    releasedAt: "2026-10-05T23:30:00.000Z",
    summary: "Pantalla del stand vertical con el mismo diseño que la horizontal.",
    items: [
      { kind: "MEJORA", text: "Pantalla vertical rediseñada como la horizontal: arriba logo, título, QR con los pasos; abajo la vidriera de productos destacados sobre fondo azul." },
      { kind: "MEJORA", text: "Vertical: QR y pasos más compactos para dejarle más lugar a la vidriera de productos." },
    ],
  },
  {
    id: "ship-2026-10-05-vidriera-vertical",
    version: "1.22.6",
    releasedAt: "2026-10-06T00:15:00.000Z",
    summary: "Pantalla vertical más limpia y vidriera con la foto a la derecha.",
    items: [
      { kind: "MEJORA", text: "Vertical: la vidriera muestra la foto del producto a la derecha, el nombre arriba a la izquierda y la marca abajo; los productos altos ya no se ven chicos." },
      { kind: "MEJORA", text: "Vertical: en lugar de los tres pasos, «Escaneá y explorá» con la cantidad de productos, más grande y aireado." },
    ],
  },
  {
    id: "ship-2026-10-06-login-soundtec",
    version: "1.22.7",
    releasedAt: "2026-10-06T01:00:00.000Z",
    summary: "Login nuevo con el estilo Soundtec y pantalla vertical centrada.",
    items: [
      { kind: "MEJORA", text: "Login rediseñado: logo oficial, formulario en tarjeta y panel azul con las marcas (en celular, cinta de logos abajo). Suma el acceso a «Solicitar cuenta»." },
      { kind: "MEJORA", text: "La página para activar la cuenta usa el mismo diseño que el login." },
      { kind: "MEJORA", text: "Pantalla vertical del stand: logo, título, QR y textos centrados, con el texto debajo del QR." },
    ],
  },
  {
    id: "ship-2026-10-06-horizontal-centrada",
    version: "1.22.8",
    releasedAt: "2026-10-06T01:20:00.000Z",
    summary: "Pantalla horizontal del stand centrada.",
    items: [
      { kind: "MEJORA", text: "Horizontal: logo, título, QR y el texto debajo del QR, todo centrado (igual que en vertical)." },
      { kind: "MEJORA", text: "Vertical: parte de arriba más compacta para que la vidriera de productos tenga más alto." },
    ],
  },
  {
    id: "ship-2026-10-06-qr-protagonista",
    version: "1.22.9",
    releasedAt: "2026-10-06T02:00:00.000Z",
    summary: "El QR vuelve a ser el protagonista y tarjetas de producto más prolijas.",
    items: [
      { kind: "FIX", text: "Pantalla del stand: QR más grande y textos más chicos; el título ya no es más ancho que el QR (horizontal y vertical)." },
      { kind: "MEJORA", text: "Tarjeta de producto en vertical: foto sobre un fondo suave, marca arriba del nombre, detalle de color y barra de avance más fina." },
    ],
  },
  {
    id: "ship-2026-10-06-login-centrado",
    version: "1.22.10",
    releasedAt: "2026-10-06T02:30:00.000Z",
    summary: "Login con el panel de marcas a la izquierda y el formulario centrado a la derecha.",
    items: [
      { kind: "MEJORA", text: "Login y activar cuenta: panel azul de marcas a la izquierda (sin bordes redondeados) y formulario a la derecha, todo centrado." },
      { kind: "MEJORA", text: "Pantalla del stand: las fotos de producto se recortan solas (sin el blanco sobrante de la foto del fabricante) y ocupan más la tarjeta." },
    ],
  },
  {
    id: "ship-2026-10-06-recordar-clave",
    version: "1.22.11",
    releasedAt: "2026-10-06T03:00:00.000Z",
    summary: "El navegador ofrece guardar usuario y contraseña al ingresar.",
    items: [
      { kind: "FIX", text: "Login: Chrome (y otros navegadores) ahora ofrecen guardar el usuario y la contraseña al ingresar, y los autocompletan la próxima vez." },
    ],
  },
  {
    id: "ship-2026-10-06-leads-crm",
    version: "1.23.0",
    releasedAt: "2026-10-06T04:00:00.000Z",
    summary: "Cada escaneo del QR pide los datos y los leads se ven en el CRM.",
    items: [
      { kind: "MEJORA", text: "Cada vez que se escanea un QR se vuelve a mostrar el formulario de datos. Solo se omite si ese dispositivo ya lo completó; haber tocado «Saltear» no cuenta." },
      { kind: "NUEVO", text: "CRM → Leads del catálogo: todos los que dejaron sus datos, con búsqueda, filtro por evento y por origen (QR o web), y si después pidieron cuenta." },
      { kind: "NUEVO", text: "En cada evento de Configuración → Expo: «Ver leads en CRM» junto a la descarga del Excel." },
      { kind: "MEJORA", text: "Dashboard: «Productos activos» muestra también cuántos son visibles en el catálogo (el número que ven los visitantes). La diferencia son productos sin marca o de marcas ocultas o inactivas." },
    ],
  },
  {
    id: "ship-2026-10-06-portal-visibilidad",
    version: "1.23.1",
    releasedAt: "2026-10-06T04:40:00.000Z",
    summary: "El portal de cada cliente cuenta y muestra solo los productos que tiene habilitados.",
    items: [
      { kind: "FIX", text: "Portal del cliente: el total de productos del inicio y de «Ver todos los productos» es solo lo que ese cliente tiene habilitado (antes mostraba el total del sistema)." },
      { kind: "FIX", text: "Portal del cliente: «Categorías con más productos» y «Últimos productos» respetan la visibilidad del cliente; ya no aparecen productos que tiene ocultos." },
    ],
  },
  {
    id: "ship-2026-10-06-stock-oculto",
    version: "1.24.0",
    releasedAt: "2026-10-06T05:10:00.000Z",
    summary: "Stock oculto para clientes y visitantes; el catálogo muestra también los productos sin stock.",
    items: [
      { kind: "MEJORA", text: "Temporalmente, clientes y visitantes no ven stock: se quitaron las leyendas («En stock», «Stock bajo», «Sin stock»), las cantidades, la columna de stock, los filtros y el acceso rápido «En stock». Vale para el portal, el catálogo público y las listas compartidas." },
      { kind: "MEJORA", text: "El catálogo del portal muestra todos los productos habilitados, también los sin stock; el total de productos del cliente los incluye." },
      { kind: "MEJORA", text: "El panel admin sigue viendo el stock como siempre." },
    ],
  },
  {
    id: "ship-2026-10-06-portal-marcas",
    version: "1.24.1",
    releasedAt: "2026-10-06T05:30:00.000Z",
    summary: "El inicio del portal muestra todas las marcas del cliente.",
    items: [
      { kind: "MEJORA", text: "Inicio del portal: «Explorar por categoría» pasa a ser «Explorar por marca», con todas las marcas que el cliente tiene habilitadas, su logo y cuántos productos tiene cada una." },
    ],
  },
  {
    id: "ship-2026-10-06-hall-research",
    version: "1.25.0",
    releasedAt: "2026-10-06T07:00:00.000Z",
    summary: "Nuevas marcas Atlona, Javelin, Hall Tech, Gain Audio y Captivate (Hall Research), con carga de listas de precios y enriquecimiento desde la web oficial.",
    items: [
      { kind: "NUEVO", text: "Sincronización → «Lista de precios Hall Research»: subís el Excel, revisás qué cambia y aplicás. «Distributor» es el costo; el MSRP se guarda solo como referencia en la ficha del admin (no se usa para precios ni se muestra a clientes)." },
      { kind: "NUEVO", text: "La primera lista crea los productos con todos sus datos (marca, categoría, descripciones, medidas, peso, origen y foto). Las siguientes solo actualizan costo y MSRP; el resto de los datos no se toca." },
      { kind: "NUEVO", text: "Los productos que una lista nueva ya no trae se muestran para que elijas: dejarlos, desactivarlos o ponerles costo a mano. Los productos nuevos de la lista se crean." },
      { kind: "NUEVO", text: "Sincronización → «Hall Research — enriquecimiento»: trae de hallresearch.com las descripciones, características y la galería de fotos oficial. No toca precios ni marca. Se puede programar como las otras fuentes." },
      { kind: "NUEVO", text: "Logos oficiales de Javelin, Hall Tech, Gain Audio y Captivate. Las 5 marcas aparecen en el catálogo, el portal, la pantalla del stand, el login, la visibilidad por cliente y el asistente." },
    ],
  },
  {
    id: "ship-2026-10-06-volver-al-catalogo",
    version: "1.25.1",
    releasedAt: "2026-10-06T08:00:00.000Z",
    summary: "Ver la contraseña al escribirla y «Volver al catálogo» vuelve a tu búsqueda.",
    items: [
      { kind: "MEJORA", text: "Login y activar cuenta: botón con un ojo para ver u ocultar la contraseña que se escribió." },
      { kind: "MEJORA", text: "«Volver al catálogo» desde la ficha de un producto vuelve a la búsqueda, filtros, orden y página donde estabas (portal, catálogo público y admin), en lugar de la grilla de marcas." },
    ],
  },
  {
    id: "ship-2026-10-06-marcas-y-accesorios",
    version: "1.25.2",
    releasedAt: "2026-10-06T08:30:00.000Z",
    summary: "Todas las marcas en el login y acción masiva para marcar accesorios.",
    items: [
      { kind: "MEJORA", text: "El panel de marcas del login muestra todas las marcas (antes solo las 12 primeras)." },
      { kind: "NUEVO", text: "Productos → acción masiva «Marcar como accesorio» / «Marcar como principal»." },
      { kind: "MEJORA", text: "Lista Hall Research: los productos de «Cables & Adaptors» y «Parts/Spares» entran como accesorios (no aparecen como destacados en la pantalla del stand)." },
    ],
  },
  {
    id: "ship-2026-10-06-soundtube-sku-tolerante",
    version: "1.25.3",
    releasedAt: "2026-10-06T09:00:00.000Z",
    summary: "La lista de SoundTube reconoce SKUs escritos con espacios o guiones distintos.",
    items: [
      { kind: "MEJORA", text: "Lista de precios SoundTube: si un SKU del Excel difiere del sistema solo en espacios o guiones (ej. «SQUAREROOT 6.5 GG» y «SQUAREROOT 6.5-GG»), se reconoce como el mismo producto y se avisa en la vista previa. Si hay dudas, no adivina." },
    ],
  },
  {
    id: "ship-2026-10-06-revision-soundtube",
    version: "1.26.0",
    releasedAt: "2026-10-06T10:30:00.000Z",
    summary: "Módulo temporal «Revisión SoundTube» para corregir la lista desde el sistema.",
    items: [
      { kind: "NUEVO", text: "Catálogo → «Revisión SoundTube» (temporal): subís la lista y resolvés cada problema desde el sistema: si un SKU es el mismo producto que uno parecido (-BK, -GB, KIT…), qué productos nuevos crear y con qué marca, qué clasificación vale en los repetidos, y qué hacer con los productos que no vienen en la lista." },
      { kind: "NUEVO", text: "Las decisiones se guardan al instante, así se puede trabajar de a poco o entre varias personas. El menú muestra cuántas faltan." },
      { kind: "NUEVO", text: "Cuando no falta nada, «Aplicar lista» hace todo junto. Al cerrar la revisión, el módulo desaparece del menú. Las equivalencias de SKU confirmadas quedan guardadas para las próximas listas." },
      { kind: "FIX", text: "Revisión SoundTube: las fechas se muestran en hora de Argentina y la pantalla responde desde el primer clic." },
    ],
  },
  {
    id: "ship-2026-10-06-logo-nuevo",
    version: "1.26.1",
    releasedAt: "2026-10-06T11:30:00.000Z",
    summary: "Logo nuevo de Soundtec en todo el sistema.",
    items: [
      { kind: "MEJORA", text: "El logo de Soundtec (sin «integramos tecnología») reemplaza al anterior en la web pública, el catálogo, el login, activar cuenta, la bienvenida de la expo, el asistente y la pantalla del stand. Las cotizaciones quedan como estaban." },
    ],
  },
  {
    id: "ship-2026-10-06-sin-leyenda-stand",
    version: "1.26.3",
    releasedAt: "2026-10-06T12:15:00.000Z",
    summary: "Sin la leyenda «Catálogo Soundtec» en el stand ni en el catálogo.",
    items: [
      { kind: "MEJORA", text: "Se quitó la leyenda «Catálogo Soundtec» de la pantalla del stand (horizontal y vertical) y del encabezado del catálogo público." },
    ],
  },
  {
    id: "ship-2026-10-06-favicon",
    version: "1.26.4",
    releasedAt: "2026-10-06T12:30:00.000Z",
    summary: "Íconos nuevos con el logo de Soundtec.",
    items: [
      { kind: "MEJORA", text: "Ícono de la pestaña del navegador con el isotipo del logo nuevo (se ve bien en pestañas claras y oscuras), y logo completo en el ícono para celular y accesos directos." },
    ],
  },
  {
    id: "ship-2026-10-06-logo-stand-chico",
    version: "1.26.5",
    releasedAt: "2026-10-06T12:45:00.000Z",
    summary: "Logo un poco más chico en la pantalla del stand.",
    items: [
      { kind: "MEJORA", text: "Pantalla del stand: el logo de Soundtec es un poco más chico, en horizontal y en vertical." },
    ],
  },
  {
    id: "ship-2026-10-06-logos-crestron-soundtube",
    version: "1.26.6",
    releasedAt: "2026-10-06T13:00:00.000Z",
    summary: "Logos nuevos de Crestron y SoundTube.",
    items: [
      { kind: "MEJORA", text: "Logos oficiales actualizados de Crestron y SoundTube (Entertainment), con el mismo tamaño que el resto, en catálogo, portal, login y pantalla del stand." },
    ],
  },
  {
    id: "ship-2026-10-06-crestron-home",
    version: "1.27.0",
    releasedAt: "2026-10-06T13:30:00.000Z",
    summary: "Crestron Home como marca propia en el catálogo.",
    items: [
      { kind: "NUEVO", text: "Crestron Home aparece como una marca más, con su logo, en el catálogo, el portal (grilla y barra de marcas, inicio), la pantalla del stand y el login. Muestra los productos de Crestron compatibles con Crestron Home: son los mismos productos (no se duplican), así que precios, sync y visibilidad por cliente siguen igual." },
      { kind: "MEJORA", text: "Logo de Crestron Home en versión horizontal (casa + texto) para que se lea bien en las tarjetas y en la cinta de marcas." },
      { kind: "MEJORA", text: "Barra de marcas del catálogo: la marca seleccionada se marca con un borde azul y fondo claro, así su logo se sigue viendo." },
    ],
  },
  {
    id: "ship-2026-10-06-landing-azul",
    version: "1.27.1",
    releasedAt: "2026-10-06T14:00:00.000Z",
    summary: "Landing con el azul de Soundtec en títulos e íconos.",
    items: [
      { kind: "MEJORA", text: "Landing: los títulos de sección (Cómo funciona, Qué incluye el portal, Para quién, Sectores, Marcas, Novedades) y los íconos usan el mismo azul de Soundtec." },
      { kind: "MEJORA", text: "«Qué tenés dentro» pasa a llamarse «Qué incluye el portal», y la tarjeta «Stock y disponibilidad» se reemplazó por «Asistente de productos» (el stock está oculto para clientes)." },
    ],
  },
  {
    id: "ship-2026-10-06-stand-ajustes",
    version: "1.27.2",
    releasedAt: "2026-10-06T14:30:00.000Z",
    summary: "Pantalla del stand: título en una línea, QR sin logo y vidriera vertical más alta.",
    items: [
      { kind: "MEJORA", text: "«Todo el catálogo, en tu celular» en una sola línea (horizontal y vertical)." },
      { kind: "MEJORA", text: "El QR de la pantalla ya no lleva el logo adentro: el logo está arriba. Se lee mejor de lejos." },
      { kind: "MEJORA", text: "Vertical: QR más chico para darle más alto a la vidriera de productos, y el logo de la marca en la tarjeta ya no se corta." },
    ],
  },
  {
    id: "ship-2026-10-06-vidriera-selector",
    version: "1.27.3",
    releasedAt: "2026-10-06T15:00:00.000Z",
    summary: "Vidriera del stand: ver lo que pasa hoy y elegir productos más fácil.",
    items: [
      { kind: "MEJORA", text: "Configuración → Expo → evento → Vidriera: muestra los productos que hoy pasan en la pantalla. Podés sacar alguno con la ✕ o tocar «Elegir a mano empezando por estos» y editar la lista." },
      { kind: "MEJORA", text: "Para agregar productos podés elegir una marca y ver todos sus productos con foto, o buscar por nombre, SKU o modelo. Las miniaturas son las mismas fotos que muestra la pantalla." },
      { kind: "MEJORA", text: "La selección automática ya no muestra ropa ni merchandising (remeras, buzos, gorras) ni productos cuya foto es el logo de la marca." },
      { kind: "MEJORA", text: "Tampoco muestra accesorios de montaje para placa de yeso (gypsum/drywall)." },
    ],
  },
  {
    id: "ship-2026-10-06-marcas-nuevas",
    version: "1.28.0",
    releasedAt: "2026-10-06T16:00:00.000Z",
    summary: "Nuevas marcas FlatPanel Audio, Dante, BrightSign y Bluesound Professional.",
    items: [
      { kind: "NUEVO", text: "Marcas oficiales FlatPanel Audio, Dante, BrightSign y Bluesound Professional, con sus logos, en el catálogo, el portal, el login y la pantalla del stand." },
      { kind: "NUEVO", text: "Las marcas que todavía no tienen productos cargados muestran «Consultá disponibilidad»: al tocarlas se abre una página con el logo de la marca y un formulario de consulta. La consulta queda en CRM → Leads del catálogo." },
      { kind: "MEJORA", text: "Cuando se carguen productos de esas marcas, pasan a funcionar como cualquier otra marca, sin hacer nada." },
      { kind: "MEJORA", text: "Página de consulta: el título va en dos líneas («Productos de [marca]» / «disponibles a pedido»)." },
    ],
  },
  {
    id: "ship-2026-10-06-crestron-home-admin",
    version: "1.28.1",
    releasedAt: "2026-10-06T16:30:00.000Z",
    summary: "Crestron Home editable desde Admin → Marcas.",
    items: [
      { kind: "MEJORA", text: "Crestron Home aparece en Admin → Marcas: desde ahí se cambia su logo y se puede ocultar del catálogo. Figura con 0 productos porque sus productos son los de Crestron compatibles con Crestron Home." },
    ],
  },
  {
    id: "ship-2026-10-06-logo-paneles",
    version: "1.28.2",
    releasedAt: "2026-10-06T17:00:00.000Z",
    summary: "Logo azul de Soundtec en el admin y el portal.",
    items: [
      { kind: "MEJORA", text: "El panel admin y el portal de clientes usan el logo azul de Soundtec (el mismo de la landing y las pantallas) en lugar del ícono anterior." },
      { kind: "MEJORA", text: "Al compartir un link del sitio (WhatsApp, redes), la vista previa muestra el logo de Soundtec." },
    ],
  },
  {
    id: "ship-2026-10-08",
    version: "1.29.0",
    releasedAt: "2026-10-08T19:00:00.000Z",
    summary: "Leads del catálogo más completos y Excel siempre disponible.",
    items: [
      { kind: "MEJORA", text: "CRM → Leads del catálogo: cada lead muestra escaneos, marcas que miró, si pidió cuenta (con actividad) y si falta el teléfono." },
      { kind: "MEJORA", text: "Descargar Excel siempre visible (con los filtros actuales): origen, evento, QR, contacto, interés, pedido de cuenta, escaneos y marcas vistas." },
      { kind: "MEJORA", text: "El Excel del evento en Configuración → Expo también incluye pedido de cuenta, escaneos y marcas vistas." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder",
    version: "1.30.0",
    releasedAt: "2026-10-08T20:00:00.000Z",
    summary: "Room Builder 3D interno: salas, hubs hotel/campus, ranking y cotización.",
    items: [
      { kind: "NUEVO", text: "Admin → Room Builder: templates de tipologías (VC, hotel, aula, eventos, living, lobby, etc.) con vista 3D multi-cámara y cobertura." },
      { kind: "NUEVO", text: "Proyectos multi-espacio (hotel, campus corporativo/educativo) con unidades repetidas y BOM agregado a cotización." },
      { kind: "NUEVO", text: "Perfiles de diseño offline desde specs/AI/dims del catálogo + ranking por compatibilidad, precio, cobertura y stock." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-2",
    version: "1.31.0",
    releasedAt: "2026-10-08T20:30:00.000Z",
    summary: "Room Builder: fichas oficiales, autocompletar y modo desde plano.",
    items: [
      { kind: "NUEVO", text: "Enrich desde vendorProductUrl oficial (FOV/alcance/diagonal) sin Serper." },
      { kind: "NUEVO", text: "Autocompletar slots con el ranking recomendado al crear o con un botón." },
      { kind: "NUEVO", text: "Modo Desde plano: subir imagen, calibrar escala y extruir muros 3D básicos." },
      { kind: "MEJORA", text: "Proxies 3D por rol (cámara, mic, display, speaker, touch, rack)." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-3",
    version: "1.32.0",
    releasedAt: "2026-10-08T21:00:00.000Z",
    summary: "Room Builder: tipologías distintas, metros y cadena Crestron.",
    items: [
      { kind: "FIX", text: "Cada tipología (hotel, aula, lobby, eventos, etc.) tiene mobiliario 3D propio; ya no parecen todas salas de reunión." },
      { kind: "NUEVO", text: "Dimensiones editables en metros (ancho/fondo/alto) al crear y dentro del editor." },
      { kind: "NUEVO", text: "Cadena Crestron/deps: procesador, teclas, accesorios incluidos/compatibles del catálogo y packs por plataforma." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-4",
    version: "1.32.1",
    releasedAt: "2026-10-08T21:20:00.000Z",
    summary: "Room Builder: ubicar productos en slots desde lista o escena 3D.",
    items: [
      { kind: "FIX", text: "Al elegir un producto del ranking se ubica en el slot seleccionado; si hay varios del mismo rol, queda en mano para clickear otro slot verde (lista o 3D)." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-5",
    version: "1.33.0",
    releasedAt: "2026-10-08T22:00:00.000Z",
    summary: "Room Builder 3D rehecho: tipologías realmente distintas y proxies de equipos.",
    items: [
      { kind: "MEJORA", text: "Cada template (huddle, boardroom, aula, hotel, suite, bar pileta, lobby, eventos, living, control, pasillo) tiene mobiliario 3D propio — ya no son cajas genéricas iguales." },
      { kind: "MEJORA", text: "Sala con 4 muros, techo, zócalos, ventanas, puerta y paleta de materiales por tipología." },
      { kind: "MEJORA", text: "Proxies de display, cámara PTZ, mic de techo, parlante, touch y rack con pantalla/leds; estilo product-render corporativo." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-6",
    version: "1.34.0",
    releasedAt: "2026-10-08T22:40:00.000Z",
    summary: "Room Builder: editor a pantalla completa y vista 3D más realista.",
    items: [
      { kind: "MEJORA", text: "El editor entra en una sola pantalla en PC: el 3D ocupa el alto útil y solo el sidebar (slots, ranking, metros, Crestron) hace scroll." },
      { kind: "NUEVO", text: "Modo Realista (HDR + sombras suaves) y vistas A nivel / Cine además de General, Frente AV, Planta y Detalle." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-7",
    version: "1.34.1",
    releasedAt: "2026-10-08T23:00:00.000Z",
    summary: "Room Builder: equipos anclados a paredes y muebles (ya no flotan).",
    items: [
      { kind: "FIX", text: "TV, touch, teclas, parlantes y racks se ubican según la tipología (ej. TV en pared frente a la cama, touch en mesita). Al abrir un proyecto viejo se re-anclan solos." },
      { kind: "MEJORA", text: "Las etiquetas 3D solo aparecen al seleccionar un equipo, para no tapar la sala." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-8",
    version: "1.34.2",
    releasedAt: "2026-10-08T23:30:00.000Z",
    summary: "Room Builder: 3D más resistente + botón Reparar 3D.",
    items: [
      { kind: "FIX", text: "Si el HDR/realista falla o la escena quedó con metros inválidos, el canvas ya no queda en blanco: cae a modo rápido y repara dims." },
      { kind: "NUEVO", text: "Botón «Reparar 3D»: rehace el layout del template y mantiene los productos asignados. Útil en proyectos viejos." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-9",
    version: "1.34.3",
    releasedAt: "2026-10-08T23:45:00.000Z",
    summary: "Room Builder: orbitar la cámara ya no rompe el 3D.",
    items: [
      { kind: "FIX", text: "Al girar/zoom la vista se cortaba por límites de cámara y sombras suaves; ahora orbita estable (modo Rápido por defecto)." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-10",
    version: "1.35.0",
    releasedAt: "2026-10-09T00:10:00.000Z",
    summary: "Room Builder: guía de plataforma/audio, foto real y mover equipos.",
    items: [
      { kind: "NUEVO", text: "Al crear una sala: cuándo usar Crestron Home, Teams, Zoom o BYOD, y si conviene Sonance, Blaze o Bluesound." },
      { kind: "NUEVO", text: "El 3D muestra la foto del catálogo del producto asignado." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-11",
    version: "1.35.1",
    releasedAt: "2026-10-09T00:30:00.000Z",
    summary: "Room Builder: cámara fija por vistas, sin orbitar.",
    items: [
      { kind: "FIX", text: "La escena ya no se gira ni se arrastra con el mouse. Se cambia solo con las vistas (General, A nivel, Cine, Frente AV, Planta, Detalle, POV)." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-12",
    version: "1.36.0",
    releasedAt: "2026-10-09T02:00:00.000Z",
    summary: "Room Builder 3D nuevo: fotorrealista, cámara libre con vistas animadas y equipos modelados.",
    items: [
      { kind: "NUEVO", text: "Cámara libre: girás, acercás y movés con mouse o dedos; las vistas (General, Cine, Planta…) viajan suave y la sala gira sola cuando no la tocás." },
      { kind: "NUEVO", text: "Materiales reales (madera, alfombra, mármol, revoque, tela), muebles 3D reales e iluminación de render con sombras suaves." },
      { kind: "NUEVO", text: "Equipos modelados por tipo: pantallas encendidas a tamaño real según pulgadas, cámaras PTZ, parlantes, micrófonos, touch y racks con LEDs." },
      { kind: "MEJORA", text: "Al tocar un equipo se ve su ficha con foto, marca y modelo; la calidad baja sola en compus más modestas." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-13",
    version: "1.36.1",
    releasedAt: "2026-10-09T02:40:00.000Z",
    summary: "Room Builder 3D: paredes en su color real y la escena ya no se reinicia al girar.",
    items: [
      { kind: "FIX", text: "Si la compu baja la calidad sola mientras girás, la sala sigue en pantalla y la cámara no vuelve al inicio." },
      { kind: "FIX", text: "Las paredes ya no se ven naranjas: mantienen el color de la tipología, con relieve de revoque." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-14",
    version: "1.37.0",
    releasedAt: "2026-10-09T03:30:00.000Z",
    summary: "Room Builder: los productos elegidos se ven reales en el 3D y el panel derecho se ordenó por pasos.",
    items: [
      { kind: "NUEVO", text: "Cada equipo con producto elegido muestra su foto real sin fondo, a su tamaño real y con espesor; las pantallas siguen en 3D encendidas." },
      { kind: "NUEVO", text: "Panel derecho en pestañas: Equipos (qué falta elegir), Sala (medidas y plano), Integración (accesorios y procesadores) y Guía." },
      { kind: "MEJORA", text: "Cada equipo se abre ahí mismo con los productos sugeridos, precio, cobertura y cuál es el recomendado; tocar un equipo en el 3D lo abre en el panel." },
    ],
  },
  {
    id: "ship-2026-10-08-room-builder-15",
    version: "1.37.1",
    releasedAt: "2026-10-09T04:00:00.000Z",
    summary: "Room Builder: productos reales a buen tamaño aunque la ficha tenga medidas de relleno.",
    items: [
      { kind: "FIX", text: "Si un producto tiene medidas de relleno (1 × 1 × 1 cm) se dibuja con el tamaño típico de su tipo, no como un punto." },
      { kind: "FIX", text: "Los accesorios agregados por la cadena no se apilan en el medio de la sala." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-plano",
    version: "1.37.2",
    releasedAt: "2026-10-09T04:40:00.000Z",
    summary: "Room Builder: subir un plano funciona y se calibra tocando dos puntos.",
    items: [
      { kind: "FIX", text: "Subir plano fallaba sin avisar; ahora la imagen se achica sola, se guarda en el sistema y si algo falla te dice por qué." },
      { kind: "MEJORA", text: "Calibración tocando los dos extremos de una medida conocida sobre el plano (ya no hay que escribir coordenadas)." },
      { kind: "FIX", text: "Al calibrar, los equipos se reubican al tamaño real de la sala." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-asistente",
    version: "1.38.0",
    releasedAt: "2026-10-09T06:00:00.000Z",
    summary: "Room Builder: asistente por pasos para crear ambientes (sistemas, control, audio, video, marcas y nivel).",
    items: [
      { kind: "NUEVO", text: "Nuevo ambiente con relevamiento por pasos: tipo de proyecto, sistemas (audio, video, videoconferencia, control, iluminación, cortinas, cartelería), Crestron Home, Crestron programado o sin control, y Teams/Zoom/BYOD." },
      { kind: "NUEVO", text: "Paso de audio: tipo de parlantes, uso, zonas, cantidad (sugerida según los m²) y streaming. Se agrega el amplificador solo." },
      { kind: "NUEVO", text: "Paso de marcas con logos por tipo de equipo; los productos de esas marcas se eligen primero. El nivel (esencial, recomendado, premium) define el orden." },
      { kind: "MEJORA", text: "Se genera solo lo que lleva el ambiente: un proyecto de audio no trae pantallas ni panel; amplificadores y procesadores de control ya no se mezclan al elegir." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-unidades",
    version: "1.39.0",
    releasedAt: "2026-10-09T07:30:00.000Z",
    summary: "Room Builder: cada equipo es un objeto propio que se arrastra, gira, duplica o quita en el 3D.",
    items: [
      { kind: "NUEVO", text: "4 parlantes son 4 objetos: se reparten solos (techo en grilla, pared enfrentadas) y cada uno se arrastra por paredes o techo con imán a la superficie." },
      { kind: "NUEVO", text: "Al elegir una unidad: Girar, Duplicar (agrega otra al lado) y Quitar. La cantidad también se cambia desde el panel con − / +." },
      { kind: "MEJORA", text: "La cotización toma la cantidad real de unidades; elegir un equipo ya no mueve la cámara (salvo en Detalle y POV)." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-sistema",
    version: "1.40.0",
    releasedAt: "2026-10-09T09:00:00.000Z",
    summary: "Room Builder: motor de sistema (amplificación, control Crestron, red y streaming) y reglas editables.",
    items: [
      { kind: "NUEVO", text: "Pestaña Sistema: calcula los canales de amplificación para tus parlantes y zonas, avisa si faltan o si la potencia queda corta, y te sugiere el amplificador justo (o cuántos del mismo)." },
      { kind: "NUEVO", text: "Dice cómo se integra cada equipo con Crestron Home o Crestron programado (driver por red, RS-232, no se integra) y sugiere switch o reproductor de streaming si hace falta." },
      { kind: "NUEVO", text: "Admin → Room Builder → Reglas: integraciones por marca/modelo y especificaciones (canales, watts, ohms) editables. Vienen precargadas y marcadas 'a confirmar'." },
      { kind: "FIX", text: "En el panel de equipos, tocar el equipo abierto ahora lo colapsa." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-sistema-fix",
    version: "1.40.1",
    releasedAt: "2026-10-09T09:20:00.000Z",
    summary: "Room Builder: sugerencias de streaming y potencias más precisas.",
    items: [
      { kind: "FIX", text: "Para streaming solo sugiere equipos que reproducen música por red (no accesorios de E/S o micrófonos)." },
      { kind: "FIX", text: "Potencias de parlante imposibles (menos de 10 W) se ignoran en el cálculo." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-muebles",
    version: "1.41.0",
    releasedAt: "2026-10-09T10:30:00.000Z",
    summary: "Room Builder: los muebles y objetos de la sala se mueven, giran o quitan.",
    items: [
      { kind: "NUEVO", text: "Tocá un mueble u objeto (pizarrón, pupitres, sillones, escenario…) para moverlo, girarlo o quitarlo de la sala." },
      { kind: "NUEVO", text: "Si ponés una pantalla encima del pizarrón, el pizarrón se oculta solo; si la pantalla va en otro lugar, queda." },
      { kind: "NUEVO", text: "Pestaña Sala → Muebles y objetos: lista por grupo para quitar o volver a poner, y Restaurar todo." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-ambientes",
    version: "1.42.0",
    releasedAt: "2026-10-09T12:00:00.000Z",
    summary: "Room Builder: 6 ambientes nuevos (dormitorio, cine en casa, galería, comedor, restaurante, local) y equipos de rack sobre su mueble.",
    items: [
      { kind: "NUEVO", text: "Residencial: Dormitorio principal, Cine en casa (L-C-R, envolventes, sub, butacas en tarima y paneles acústicos), Galería / jardín y Cocina / comedor." },
      { kind: "NUEVO", text: "Comercial: Restaurante / bar (música por zonas, pantallas, menú digital) y Local comercial (cartelería de vidriera, estanterías, caja)." },
      { kind: "MEJORA", text: "Amplificadores y procesadores se apoyan sobre un mueble técnico en vez de flotar; cada ambiente tiene su piso, colores y luz." },
      { kind: "FIX", text: "En plantillas con varios grupos de parlantes (cine) el asistente respeta frontales, envolventes y subwoofer." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-soportes",
    version: "1.42.1",
    releasedAt: "2026-10-09T12:30:00.000Z",
    summary: "Room Builder: soportes y accesorios ya no se proponen como pantallas o equipos.",
    items: [
      { kind: "FIX", text: "Al elegir una pantalla ya no aparecen soportes (MNT, mount, bracket); soportes, cables, fuentes y accesorios quedan fuera de los equipos sugeridos." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-ar",
    version: "1.43.0",
    releasedAt: "2026-10-09T13:30:00.000Z",
    summary: "Room Builder: maqueta 3D descargable y realidad aumentada (Ver en tu espacio).",
    items: [
      { kind: "NUEVO", text: "Botón AR en el visor: la sala como maqueta 3D para girar; desde el celular, 'Ver en tu espacio' la pone en realidad aumentada (Android con Chrome, iPhone con Safari)." },
      { kind: "NUEVO", text: "Descarga de la maqueta en .glb para compartir o abrir en otros programas 3D." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-ar-fix",
    version: "1.43.1",
    releasedAt: "2026-10-09T13:50:00.000Z",
    summary: "Room Builder: la maqueta AR muestra la sala de cerca, sin terreno ni techo.",
    items: [
      { kind: "FIX", text: "La maqueta 3D / AR se encuadra en la sala (antes quedaba chiquita por el terreno de alrededor) y se ve por dentro, sin techo; pesa menos." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-ar-angulo",
    version: "1.43.2",
    releasedAt: "2026-10-09T14:10:00.000Z",
    summary: "Room Builder: la maqueta AR abre desde el mismo ángulo que el editor.",
    items: [
      { kind: "FIX", text: "La maqueta 3D se abre mirando la sala desde donde la estás viendo, con el interior a la vista (no la cara de afuera de una pared)." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-desde-plano",
    version: "1.44.0",
    releasedAt: "2026-10-09T16:00:00.000Z",
    summary: "Room Builder: proyecto completo desde un plano (detecta el tipo, los ambientes y sus medidas).",
    items: [
      { kind: "NUEVO", text: "Desde un plano: lo subís y la IA detecta qué es (casa, oficina, hotel, local…), cada ambiente con su nombre y las medidas escritas, y propone el tipo de cada uno (baños y pasillos sin equipos)." },
      { kind: "NUEVO", text: "Revisión sobre el plano: mover y estirar los recuadros, dibujar ambientes nuevos, cambiar tipo, incluir o no, y calibrar la escala tocando una medida conocida." },
      { kind: "NUEVO", text: "Genera todas las salas 3D de una, con medidas reales, control y nivel comunes y productos sugeridos; el proyecto muestra el plano con cada ambiente para entrar." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-plano-muros",
    version: "1.44.1",
    releasedAt: "2026-10-09T17:00:00.000Z",
    summary: "Room Builder: los ambientes del plano se ubican exactos sobre los muros.",
    items: [
      { kind: "MEJORA", text: "La forma de cada ambiente sale de los espacios cerrados del plano (muros detectados en la imagen); la IA aporta nombre y tipo. Antes los recuadros quedaban corridos." },
      { kind: "NUEVO", text: "Si el plano tiene un espacio que la IA no nombró, aparece como 'Ambiente sin nombre' para que le pongas tipo." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-plano-marcas",
    version: "1.44.2",
    releasedAt: "2026-10-09T17:40:00.000Z",
    summary: "Room Builder: lectura de planos más precisa (cada espacio numerado y leído por la IA).",
    items: [
      { kind: "MEJORA", text: "Primero se detectan los espacios cerrados del plano y se numeran; la IA solo lee qué ambiente es cada número. Ya no se cruzan nombres entre ambientes vecinos." },
      { kind: "MEJORA", text: "Ambientes sin muros que los cierren (planta abierta) igual se detectan y se ajustan a las paredes cercanas." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-plano-recortes",
    version: "1.44.3",
    releasedAt: "2026-10-09T18:10:00.000Z",
    summary: "Room Builder: cada ambiente del plano se lee por separado (sin nombres cruzados).",
    items: [
      { kind: "FIX", text: "La IA lee cada espacio del plano recortado por separado, así el nombre y las medidas de cada ambiente quedan en su lugar." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-plano-tipos",
    version: "1.44.4",
    releasedAt: "2026-10-09T18:40:00.000Z",
    summary: "Room Builder: los ambientes del plano toman su tipo por el nombre (Dormitorio 2 = dormitorio).",
    items: [
      { kind: "FIX", text: "Dormitorios secundarios, livings y demás ambientes con nombre claro ya no quedan como 'sin equipos'; el nombre escrito en el plano define el tipo." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-generando",
    version: "1.44.5",
    releasedAt: "2026-10-09T19:10:00.000Z",
    summary: "Room Builder: se ve que está generando al crear un proyecto desde el plano o el asistente.",
    items: [
      { kind: "FIX", text: "Al tocar Generar aparece 'Generando N ambientes…' y el botón queda bloqueado hasta terminar (antes no había señal y se podía tocar dos veces)." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-plano-cad",
    version: "1.45.0",
    releasedAt: "2026-10-09T21:00:00.000Z",
    summary: "Room Builder: lectura de planos CAD reales (muros finos, puertas abiertas, muebles dibujados).",
    items: [
      { kind: "MEJORA", text: "Detecta muros en gris claro y finos (planos CAD), separa ambientes aunque las puertas estén abiertas y no confunde muebles, mostradores ni textos con ambientes." },
      { kind: "MEJORA", text: "Si un ambiente quedó partido en dos y la IA les pone el mismo nombre, se unen solos." },
    ],
  },
  {
    id: "ship-2026-10-09-room-builder-cualquier-ambiente",
    version: "1.46.0",
    releasedAt: "2026-10-09T23:00:00.000Z",
    summary: "Room Builder: cualquier ambiente se genera y cualquier producto del catálogo se puede ubicar.",
    items: [
      { kind: "NUEVO", text: "Tipos nuevos: Oficina privada, Open space / puestos de trabajo, Sala de descanso / office, Pasillo / circulación, Baño y Ambiente libre. Desde un plano, todo ambiente detectado se puede generar (baños y pasillos vienen destildados)." },
      { kind: "NUEVO", text: "En cada equipo: pestaña 'Todo el catálogo' para buscar libre por marca, modelo o SKU, con foto y precio, cuando los sugeridos no sirven." },
      { kind: "NUEVO", text: "Botón 'Agregar equipo': cualquier producto del catálogo, en techo, pared, mesa, piso o rack, con cantidad; aparece en el 3D para arrastrarlo. Se puede quitar después." },
    ],
  },
  {
    id: "ship-2026-10-09-plano-lapiz",
    version: "1.47.0",
    releasedAt: "2026-10-10T01:00:00.000Z",
    summary: "Proyecto desde plano: lápiz para dibujar ambientes con líneas, edición de los detectados y renombre sobre el plano.",
    items: [
      { kind: "NUEVO", text: "Herramienta Lápiz: marcás cada esquina con un clic y se arma el ambiente (forma de L, ochavas, lo que sea). Las líneas se enderezan solas y se pegan a las esquinas de los ambientes vecinos; se cierra tocando el primer punto, con doble clic o Enter." },
      { kind: "NUEVO", text: "Ambientes detectados editables: arrastrás esquinas y paredes, doble clic en una pared agrega una esquina y doble clic en una esquina la quita." },
      { kind: "NUEVO", text: "Doble clic adentro de un ambiente para cambiarle el nombre ahí mismo. Si el tipo era automático, se deduce del nombre (por ejemplo 'Sala de reuniones')." },
      { kind: "MEJORA", text: "Los ambientes con forma libre se generan en 3D con sus paredes y piso reales, muestran la superficie real y se ven con su forma en el plano del proyecto." },
    ],
  },
];
