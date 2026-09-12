import type { OnboardingTour } from "./types";

/**
 * Tutorial guiado del admin.
 * El host NO navega solo: los pasos con requirePath enseñan a abrir la pantalla
 * desde el menú y esperan a que el usuario lo haga.
 */
export const ADMIN_ONBOARDING: OnboardingTour = {
  id: "admin",
  title: "Tutorial del panel",
  subtitle: "Recorrido guiado por la operación diaria",
  welcomeTitle: "Te damos la bienvenida al panel Soundtec",
  welcomeBody:
    "Este tutorial te acompaña módulo por módulo: vas a aprender cómo crear clientes, armar precios, publicar catálogo, responder pedidos y emitir cotizaciones. En cada paso te mostramos qué clickear; el salto entre pantallas lo hacés vos.",
  steps: [
    {
      id: "admin-menu",
      route: "/admin",
      target: "nav-sidebar",
      title: "El menú es tu mapa",
      body: "A la izquierda está todo el panel agrupado por temas. Durante el tutorial te vamos a pedir que abras cada módulo desde acá: así memorizás el camino real de trabajo.",
      bullets: [
        "Operación: dashboard, pedidos y cotizaciones.",
        "Catálogo: productos y marcas.",
        "Precios y visibilidad: márgenes, descuentos, qué ve cada cliente y listas compartibles.",
        "CRM: clientes y usuarios.",
      ],
      tip: "Podés abrir o cerrar cada grupo tocando su título.",
    },
    {
      id: "admin-dashboard",
      route: "/admin",
      target: "dash-stats",
      title: "Dashboard: el pulso del día",
      body: "Estas tarjetas resumen la actividad reciente. No se editan acá: son un atajo visual para saber si hay pedidos nuevos, cotizaciones en curso o movimiento comercial.",
      affects: "Los números salen de Pedidos, Cotizaciones y Clientes.",
    },
    {
      id: "admin-dash-crm",
      route: "/admin",
      target: "dash-crm",
      title: "Resumen CRM",
      body: "Más abajo ves un vistazo de clientes y actividad. Desde acá podés saltar a una ficha, pero el alta y la edición vive en CRM → Clientes.",
    },

    // —— CLIENTES ——
    {
      id: "goto-clients",
      route: "/admin",
      target: "nav-link-clients",
      title: "Abrí Clientes",
      body: "En el menú, dentro de CRM, hacé click en «Clientes». Nosotros no cambiamos la pantalla por vos: ese click es el hábito que vas a repetir todos los días.",
      requirePath: "/admin/clients",
      autoAdvanceOnRoute: true,
      tip: "Si el grupo CRM está cerrado, abrilo tocando el título «CRM».",
    },
    {
      id: "clients-list",
      route: "/admin/clients",
      target: "page-header",
      title: "Lista de clientes",
      body: "Acá viven todas las empresas. Cada fila es una cuenta comercial: contactos, usuarios del portal, pedidos y cotizaciones cuelgan de esta ficha.",
      bullets: [
        "Buscá por razón social, fantasía o CUIT.",
        "Entrá a una ficha para ver el historial completo.",
      ],
    },
    {
      id: "clients-new",
      route: "/admin/clients",
      target: "clients-new-btn",
      title: "Cómo crear un cliente",
      body: "Tocá «Nuevo cliente». Se abre un asistente en 2 pasos. No hace falta que lo completes ahora: mirá qué hace cada campo cuando lo uses.",
      bullets: [
        "Paso 1 — Empresa: Razón social (obligatorio), Nombre de fantasía, CUIT, Segmento (Integrador, Corporativo, Educación, Residencial, Gobierno, Rental) y Responsable interno.",
        "Paso 2 — Contacto: nombre, cargo, email, teléfono y WhatsApp.",
        "Checkbox «Crear también un usuario del portal para este contacto»: si lo tildás, además de la empresa se crea un login para que esa persona entre al portal B2B.",
        "Si tildás el checkbox, pedí nombre + email del contacto. La contraseña inicial es opcional: si la dejás vacía, el sistema genera una temporal y te la muestra una sola vez.",
        "Si NO tildás el checkbox, el cliente queda cargado sin acceso al portal (útil para cuentas solo comerciales).",
      ],
      tip: "Después del alta podés sumar más contactos y usuarios desde la ficha del cliente.",
      affects: "El cliente define precios, visibilidad de catálogo y a quién le llegan los pedidos del portal.",
    },
    {
      id: "clients-after",
      route: "/admin/clients",
      target: "page-header",
      title: "Qué pasa después de crear",
      body: "Al guardar, entrás a la ficha del cliente. Ahí centralizás contactos, usuarios del portal, pedidos, cotizaciones, precios y visibilidad.",
      bullets: [
        "Desde la ficha podés crear una cotización ya vinculada a esa empresa.",
        "También podés editar datos, desactivar la cuenta o gestionar accesos sin borrar el historial.",
      ],
    },

    // —— USUARIOS ——
    {
      id: "goto-users",
      route: "/admin/clients",
      target: "nav-link-users",
      title: "Abrí Usuarios",
      body: "Siguiente parada: CRM → Usuarios. Hacé click en «Usuarios» en el menú.",
      requirePath: "/admin/users",
      autoAdvanceOnRoute: true,
    },
    {
      id: "users-list",
      route: "/admin/users",
      target: "page-header",
      title: "Usuarios del sistema",
      body: "Acá están quienes entran al panel o al portal. Un usuario de portal siempre pertenece a un cliente; un administrador opera el panel.",
    },
    {
      id: "users-new",
      route: "/admin/users",
      target: "users-new-btn",
      title: "Cómo crear un usuario",
      body: "Tocá «Nuevo usuario». Elegí el tipo con cuidado: eso define qué interfaz ve.",
      bullets: [
        "Cliente del portal: ve catálogo y precios de su empresa; debe estar vinculado a un Cliente.",
        "Administrador: gestiona la operación del panel.",
        "Super admin: acceso completo (solo si quien crea también es super admin).",
        "Contraseña: podés generar una temporal (se muestra una vez) o escribirla vos.",
        "Permisos avanzados: un rol personalizado puede limitar menús y acciones dentro del admin.",
      ],
      affects: "Sin usuario de portal, el cliente no puede pedir solo; sin admin, no hay quien responda.",
    },

    // —— PRODUCTOS ——
    {
      id: "goto-products",
      route: "/admin/users",
      target: "nav-link-products",
      title: "Abrí Productos",
      body: "Vamos al catálogo. En el menú, grupo Catálogo → «Productos».",
      requirePath: "/admin/products",
      autoAdvanceOnRoute: true,
    },
    {
      id: "products-list",
      route: "/admin/products",
      target: "page-header",
      title: "Catálogo de productos",
      body: "Cada ficha alimenta el portal, las cotizaciones y las listas compartibles. Lo que no esté activo o completo impacta en lo que el cliente puede ver y comprar.",
      bullets: [
        "Filtrá por marca, categoría, stock, activos, sin foto o sin descripción.",
        "«Nuevo producto» crea una ficha desde cero.",
        "La edición en masa sirve para activar/desactivar varios a la vez.",
      ],
    },
    {
      id: "products-tabs",
      route: "/admin/products",
      target: "products-tabs",
      title: "Catálogo vs Crestron Home",
      body: "Las pestañas separan el catálogo general de los productos pensados para Crestron Home. Usá la que corresponda al trabajo del día.",
    },
    {
      id: "products-edit",
      route: "/admin/products",
      target: "page-header",
      title: "Qué se edita en una ficha",
      body: "Al abrir un producto vas a ver identificación (códigos, modelo), clasificación (marca, rubro, familia), cadena de costos y disponibilidad.",
      bullets: [
        "El PVP no se tipea a mano: lo calcula el motor con costo × margen (− descuentos).",
        "Checkboxes típicos: producto activo, configurable, accesorio que exige principal, compatible Crestron Home.",
        "Fotos, textos e IA se completan en la misma ficha.",
      ],
      affects: "Marcas, márgenes, descuentos, visibilidad y el portal usan estos datos.",
    },

    // —— MARCAS ——
    {
      id: "goto-brands",
      route: "/admin/products",
      target: "nav-link-brands",
      title: "Abrí Marcas",
      body: "Catálogo → «Marcas». Click en el menú.",
      requirePath: "/admin/brands",
      autoAdvanceOnRoute: true,
    },
    {
      id: "brands",
      route: "/admin/brands",
      target: "page-header",
      title: "Marcas",
      body: "Las marcas ordenan el catálogo y son el ancla más usada en reglas de precio y visibilidad.",
      bullets: [
        "Al crear: Nombre, logo, descripción y checkbox «Marca activa».",
        "Si desactivás una marca, deja de usarse en filtros y reglas nuevas.",
        "Eliminar una marca deja los productos sin marca (no borra productos).",
      ],
      affects: "Filtros del portal, márgenes, descuentos y visibilidad por marca.",
    },

    // —— MÁRGENES ——
    {
      id: "goto-margins",
      route: "/admin/brands",
      target: "nav-link-margins",
      title: "Abrí Márgenes",
      body: "Precios y visibilidad → «Márgenes».",
      requirePath: "/admin/margins",
      autoAdvanceOnRoute: true,
    },
    {
      id: "margins",
      route: "/admin/margins",
      target: "page-header",
      title: "Márgenes: cómo se forma el precio",
      body: "Acá definís el markup. El precio de lista sale de costo nacionalizado × markup. Después se restan descuentos.",
      bullets: [
        "¿Para quién?: todos los clientes, o uno/varios clientes.",
        "¿Sobre qué?: todo el catálogo, marca(s), producto(s), categoría, familia o proveedor.",
        "¿Cómo?: Markup × (ej. 1,35) o Margen %.",
        "Una regla más específica gana: cliente+producto > cliente+marca > global.",
        "Checkbox «Regla activa»: apagar sin borrar.",
      ],
      tip: "Markup 2,75 significa ×2,75 (no se le suma 1).",
      affects: "Portal, cotizaciones y listas compartibles usan este precio.",
    },

    // —— DESCUENTOS ——
    {
      id: "goto-discounts",
      route: "/admin/margins",
      target: "nav-link-discounts",
      title: "Abrí Descuentos",
      body: "Precios y visibilidad → «Descuentos».",
      requirePath: "/admin/discounts",
      autoAdvanceOnRoute: true,
    },
    {
      id: "discounts",
      route: "/admin/discounts",
      target: "page-header",
      title: "Descuentos comerciales",
      body: "Se restan después del margen. Sirven para acuerdos por cliente o campañas por marca/producto.",
      bullets: [
        "Misma lógica de alcance que márgenes (quién + qué).",
        "También existen descuentos en la ficha del producto y etiquetas de oferta del fabricante.",
        "Precedencia típica: descuento de cliente específico > ficha de producto > reglas generales.",
      ],
      affects: "Baja el precio final sin tocar el costo ni el markup base.",
    },

    // —— VISIBILIDAD ——
    {
      id: "goto-visibility",
      route: "/admin/discounts",
      target: "nav-link-visibility",
      title: "Abrí Visibilidad",
      body: "Precios y visibilidad → «Visibilidad por cliente».",
      requirePath: "/admin/visibility",
      autoAdvanceOnRoute: true,
    },
    {
      id: "visibility",
      route: "/admin/visibility",
      target: "page-header",
      title: "Qué ve cada cliente",
      body: "Por defecto el cliente ve todo el catálogo activo. Acá cargás excepciones.",
      bullets: [
        "Elegí el cliente (obligatorio).",
        "Alcance: marcas, proveedores, categorías, familias o productos.",
        "«Ocultar»: lista negra (no lo ve).",
        "«Permitir explícitamente»: lista blanca avanzada.",
        "Ocultar una marca esconde todos sus productos para ese cliente.",
      ],
      tip: "Si en el portal «faltan» productos, revisá primero esta pantalla.",
      affects: "El portal y las listas compartibles respetan estas reglas.",
    },

    // —— LISTAS COMPARTIBLES ——
    {
      id: "goto-share-lists",
      route: "/admin/visibility",
      target: "nav-link-share-lists",
      title: "Abrí Listas compartibles",
      body: "Precios y visibilidad → «Listas compartibles».",
      requirePath: "/admin/share-lists",
      autoAdvanceOnRoute: true,
    },
    {
      id: "share-lists",
      route: "/admin/share-lists",
      target: "share-lists-new-btn",
      title: "Listas de precios compartibles",
      body: "Armás un recorte de catálogo y lo compartís con un link público (sin login). Ideal para enviar precios a un cliente o proyecto puntual. Tocá «Nueva lista» para crear una.",
      bullets: [
        "Nombre, descripción visible en el link, estado (Borrador / Activa / Archivada).",
        "«Precios para cliente»: aplica márgenes, descuentos y visibilidad de esa empresa.",
        "Vencimiento del link, mostrar/ocultar SKU, stock o precios.",
        "Filtros: principales, accesorios, stock, descuento, marcas, categorías, productos puntuales.",
        "Cuando está Activa, copiá el link y compartilo. Podés regenerarlo si hace falta invalidar el anterior.",
      ],
      affects: "Quien abre el link ve el catálogo filtrado con la política de precios elegida.",
    },

    // —— PEDIDOS ——
    {
      id: "goto-requests",
      route: "/admin/share-lists",
      target: "nav-link-requests",
      title: "Abrí Pedidos",
      body: "Operación → «Pedidos».",
      requirePath: "/admin/requests",
      autoAdvanceOnRoute: true,
    },
    {
      id: "requests",
      route: "/admin/requests",
      target: "page-header",
      title: "Pedidos del portal",
      body: "Cuando el cliente arma el carrito y envía, el pedido aparece acá. Es la bandeja de entrada comercial.",
      bullets: [
        "Estados: Nuevo, En revisión, Respondido, Confirmado, Rechazado, Cerrado.",
        "Tipos: Cotización, Compra, Consulta.",
        "Desde el detalle: responder, cambiar estado, crear o adjuntar una cotización.",
      ],
      affects: "Conecta el portal del cliente con Cotizaciones.",
    },

    // —— COTIZACIONES ——
    {
      id: "goto-quotes",
      route: "/admin/requests",
      target: "nav-link-quotes",
      title: "Abrí Cotizaciones",
      body: "Operación → «Cotizaciones».",
      requirePath: "/admin/quotes",
      autoAdvanceOnRoute: true,
    },
    {
      id: "quotes-list",
      route: "/admin/quotes",
      target: "page-header",
      title: "Cotizaciones",
      body: "Propuestas formales con diseño Soundtec: ítems, textos, PDF y emisión.",
      bullets: [
        "«Nueva cotización»: flujo completo (cliente, brief, módulos, BOM, textos, emitir).",
        "«Cotización rápida»: armar y emitir desde una sola pantalla.",
        "Estados: Borrador, En revisión, Lista, Emitida, Reemplazada, Archivada.",
      ],
    },
    {
      id: "quotes-new",
      route: "/admin/quotes",
      target: "quotes-new-btn",
      title: "Nueva vs rápida",
      body: "Usá la completa cuando el proyecto necesita brief, módulos y revisión. Usá la rápida para una lista corta que hay que mandar ya.",
      tip: "Sin cliente asociado no se puede emitir el PDF final.",
      affects: "Toma precios del motor (márgenes/descuentos) y puede vincularse a un pedido.",
    },

    // —— MODO CLIENTE ——
    {
      id: "goto-mode",
      route: "/admin/quotes",
      target: "nav-link-dashboard",
      title: "Volvé al Dashboard",
      body: "Para el último tramo, abrí «Dashboard» en Operación.",
      requirePath: "/admin",
      autoAdvanceOnRoute: true,
    },
    {
      id: "mode-client",
      route: "/admin",
      target: "mode-client",
      title: "Probar el portal (Modo cliente)",
      body: "El botón «Modo cliente» abre el portal con tu mismo login. Sirve para validar catálogo, precios, carrito y el pedido de punta a punta.",
      bullets: [
        "No cambia de usuario: es la misma sesión en otra interfaz.",
        "Para volver, en el portal usá «Modo admin».",
        "Lo que ves en el portal depende de visibilidad y precios configurados en el admin.",
      ],
      tip: "Hacé el circuito: portal → agregar al carrito → enviar pedido → verlo en Admin → Pedidos.",
    },
    {
      id: "help-dock",
      route: "/admin",
      target: "help-dock",
      title: "Ayuda siempre a mano",
      body: "El botón Ayuda abre el asistente, recorridos por pantalla y este tutorial. Si querés repetir el paseo: Ayuda → «Empezar guía de nuevo».",
    },
    {
      id: "admin-done",
      route: "/admin",
      title: "Listo para operar",
      body: "Ya recorriste el circuito completo. Sugerencia práctica: creá un cliente de prueba, asignale un margen, mirá un producto en Modo cliente y armá una cotización rápida.",
      tip: "El progreso queda en tu usuario. Podés reiniciar la guía cuando quieras.",
    },
  ],
};

export const PORTAL_ONBOARDING: OnboardingTour = {
  id: "portal",
  title: "Tutorial del portal",
  subtitle: "Catálogo, listas y pedidos",
  welcomeTitle: "Bienvenido al portal Soundtec",
  welcomeBody:
    "Desde acá consultás el catálogo con tus precios, armás listas y enviás pedidos. Te mostramos el circuito; los clicks los hacés vos.",
  steps: [
    {
      id: "portal-home",
      route: "/portal",
      target: "portal-home-hero",
      title: "Tu inicio",
      body: "Buscá por modelo, marca o palabra clave. Los precios que ves ya incluyen las condiciones de tu cuenta.",
    },
    {
      id: "portal-nav",
      route: "/portal",
      target: "portal-nav",
      title: "Navegación",
      body: "Catálogo, Favoritos, Mis listas y Mis pedidos. En el celular también están en la barra inferior.",
      tip: "Para cambiar de sección, tocá el ítem del menú (no hace falta que el tutorial lo haga por vos).",
    },
    {
      id: "goto-portal-catalog",
      route: "/portal",
      target: "portal-nav",
      title: "Abrí el Catálogo",
      body: "Hacé click en «Catálogo» en el menú superior (o en la barra de abajo si estás en el teléfono).",
      requirePath: "/portal/products",
      autoAdvanceOnRoute: true,
    },
    {
      id: "portal-catalog",
      route: "/portal/products",
      target: "page-header",
      title: "Catálogo con tus precios",
      body: "Solo ves lo disponible para tu empresa. El precio ya tiene márgenes y descuentos aplicados por Soundtec.",
      bullets: [
        "Filtrá por stock, descuento o favoritos cuando lo necesites.",
        "Abrí un producto para ver ficha y agregar al carrito.",
      ],
    },
    {
      id: "goto-portal-wishlist",
      route: "/portal/products",
      target: "portal-nav",
      title: "Abrí Favoritos",
      body: "En el menú, tocá «Favoritos».",
      requirePath: "/portal/wishlist",
      autoAdvanceOnRoute: true,
    },
    {
      id: "portal-wishlist",
      route: "/portal/wishlist",
      target: "page-header",
      title: "Favoritos",
      body: "Es tu selección personal para volver rápido. No envía nada a Soundtec hasta que armes un pedido.",
    },
    {
      id: "goto-portal-lists",
      route: "/portal/wishlist",
      target: "portal-nav",
      title: "Abrí Mis listas",
      body: "En el menú, tocá «Mis listas».",
      requirePath: "/portal/lists",
      autoAdvanceOnRoute: true,
    },
    {
      id: "portal-lists",
      route: "/portal/lists",
      target: "page-header",
      title: "Mis listas",
      body: "Listas de trabajo por obra o proyecto. Podés reutilizarlas al armar un pedido.",
    },
    {
      id: "portal-cart",
      route: "/portal/lists",
      target: "portal-cart",
      title: "Carrito / borrador",
      body: "Mientras cargás productos se arma un borrador. Cuando esté listo, lo enviás al equipo Soundtec.",
      affects: "Al enviar, el pedido aparece en Admin → Pedidos.",
    },
    {
      id: "goto-portal-requests",
      route: "/portal",
      target: "portal-nav",
      title: "Abrí Mis pedidos",
      body: "En el menú, tocá «Mis pedidos».",
      requirePath: "/portal/requests",
      autoAdvanceOnRoute: true,
    },
    {
      id: "portal-requests",
      route: "/portal/requests",
      target: "page-header",
      title: "Mis pedidos",
      body: "Historial de lo enviado y las respuestas (incluida una cotización formal si te la adjuntan).",
    },
    {
      id: "portal-done",
      route: "/portal",
      title: "Ya podés pedir",
      body: "Circuito listo. Empezá por el catálogo, agregá al carrito y enviá tu primer pedido.",
      tip: "Si también usás el panel, «Modo admin» arriba a la derecha te lleva de vuelta.",
    },
  ],
};

export function tourForSurface(surface: "admin" | "portal"): OnboardingTour {
  return surface === "admin" ? ADMIN_ONBOARDING : PORTAL_ONBOARDING;
}
