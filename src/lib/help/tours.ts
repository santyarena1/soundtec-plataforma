import { moduleForPath } from "./modules";

export type TourStep = {
  target: string;
  title: string;
  body: string;
  editable?: string;
};

export type TourDef = {
  id: string;
  title: string;
  steps: TourStep[];
};

export const TOURS: TourDef[] = [
  {
    id: "quotes-list",
    title: "Lista de cotizaciones",
    steps: [
      {
        target: "quotes-new-btn",
        title: "Nueva cotización",
        body: "Acá empieza el flujo. Primero tipo de sala y escala, después el documento.",
        editable: "Hace falta el permiso de crear cotizaciones.",
      },
      {
        target: "quotes-history",
        title: "Memoria histórica",
        body: "Excel de planillas viejas. No trae precios. Sirve para sugerir qué se cotizó junto.",
        editable: "Sólo quien administra la biblioteca de cotizaciones.",
      },
    ],
  },
  {
    id: "quotes-new",
    title: "Nueva cotización",
    steps: [
      {
        target: "new-classifiers",
        title: "Clasificación interna",
        body: "Lo primero. Tipo de sala y escala. No lo ve el cliente. Sirve para sugerir equipos de COT parecidas.",
        editable: "Las opciones se editan en Configuración → Cotizaciones → Clasificadores.",
      },
      {
        target: "new-client",
        title: "Cliente",
        body: "Podés dejarlo vacío y asignarlo después. Sin cliente no se emite.",
        editable: "La lista sale de Admin → Clientes.",
      },
      {
        target: "new-brief",
        title: "Qué querés armar",
        body: "Prompt interno. Ej. «videoconferencia grande, misma base que la mediana». Si no escribís, igual sugerimos según tipo y escala.",
        editable: "Se puede cambiar después en Brief y planos.",
      },
      {
        target: "new-submit",
        title: "Crear propuesta",
        body: "Reserva el número, carga la plantilla y, si hay brief o clasificación, pasa a generar con IA.",
      },
    ],
  },
  {
    id: "quote-datos",
    title: "Datos de la COT",
    steps: [
      {
        target: "quote-wizard",
        title: "Pasos",
        body: "Siete pasos. Podés saltar. El documento de la derecha es el que se imprime / PDF.",
      },
      {
        target: "quote-classifiers",
        title: "Clasificación",
        body: "Guardala para que Memoria interna compare con otras COT. No sale en el PDF.",
        editable: "Opciones en Configuración → Clasificadores. En una COT emitida no se cambia.",
      },
      {
        target: "quote-memory",
        title: "Memoria interna",
        body: "Si hay COT con el mismo tipo/escala, sugiere equipos. Agregar los pone en la planilla.",
        editable: "No copia precios. La primera de cada combinación no tiene sugerencias de COT.",
      },
      {
        target: "quote-header",
        title: "Cliente y referencia",
        body: "Salen en la carta. Layout y columna entrega son de esta COT.",
        editable: "Hasta emitir. Cliente se carga en Admin → Clientes.",
      },
    ],
  },
  {
    id: "quote-brief",
    title: "Brief y planos",
    steps: [
      {
        target: "quote-memory",
        title: "Sugerencias",
        body: "Mientras escribís o generás, si coincide con otra COT o con el Excel histórico, aparecen acá.",
      },
      {
        target: "quote-brief",
        title: "Brief",
        body: "El problema a resolver. La IA lo usa para la propuesta. No pongas precios acá.",
        editable: "Libre. Generar no pisa los módulos fijos.",
      },
      {
        target: "quote-generate",
        title: "Generar con IA",
        body: "Completa propuesta, criterios y funcionalidad. No inventa precios. No reescribe presentación, ISO ni condiciones.",
      },
    ],
  },
  {
    id: "quote-plantilla",
    title: "Plantilla de esta COT",
    steps: [
      {
        target: "quote-add-module",
        title: "Agregar módulo",
        body: "Módulo extra: título, texto a mano o con prompt, fotos y layout. Podés guardarlo como borrador; no entra solo en las próximas.",
        editable: "Los fijos se prenden/apagan con Incluido. La planilla de productos siempre va.",
      },
      {
        target: "quote-live",
        title: "Documento vivo",
        body: "Clickeá y escribí. Texto fijo vs IA. Las fotos del módulo se acomodan izquierda/derecha/arriba/abajo o dos en fila.",
        editable: "Esta COT. La plantilla maestra está en Configuración → Plantilla visual.",
      },
    ],
  },
  {
    id: "quote-planilla",
    title: "Planilla y ambientes",
    steps: [
      {
        target: "quote-memory",
        title: "Memoria",
        body: "Si esta COT coincide con otra, te sugiere equipos usados. También accesorios del catálogo más abajo.",
      },
      {
        target: "quote-add-zone",
        title: "Agregar ambiente",
        body: "Otra tabla: habitación, cocina, etc. Cada una tiene explicación y subtotal. El total general va al final.",
        editable: "Quitar ambiente no borra equipos: vuelven a general.",
      },
      {
        target: "quote-bom",
        title: "Filas",
        body: "Cantidad, precio, IVA, opcional, foto. Regenerar descripción corta la guarda en el producto del catálogo.",
        editable: "Hasta emitir. Fijar evita que la IA de ítem lo pise.",
      },
    ],
  },
  {
    id: "quote-textos",
    title: "Textos de proyecto",
    steps: [
      {
        target: "quote-live",
        title: "Documento",
        body: "Los textos de propuesta se editan acá, a la derecha. Clickeá y escribí.",
        editable: "Fijar un módulo evita que Generar propuesta lo pise.",
      },
    ],
  },
  {
    id: "quote-imagenes",
    title: "Imágenes",
    steps: [
      {
        target: "quote-live",
        title: "Fotos en el documento",
        body: "Foto de producto: de esta COT. Collage de marcas e ISO: corporativos, se configuran en settings.",
        editable: "Las fotos de un módulo extra no se duplican en la galería suelta.",
      },
    ],
  },
  {
    id: "quote-emitir",
    title: "Emitir",
    steps: [
      {
        target: "quote-issue",
        title: "Condiciones y emitir",
        body: "Condiciones del sistema, las del cliente anterior, o nuevas. Emitir congela la COT y genera un PDF snapshot.",
        editable: "Sin cliente no se emite. Para cambiar una emitida, se trabaja otra versión.",
      },
    ],
  },
  {
    id: "settings-quotes",
    title: "Configuración de cotizaciones",
    steps: [
      {
        target: "settings-classifiers",
        title: "Clasificadores",
        body: "Acá se editan tipo de sala, escala y cualquier selector nuevo del inicio de la COT.",
      },
      {
        target: "settings-template",
        title: "Plantilla visual",
        body: "Textos fijos de las COT nuevas. Las ya creadas no se tocan.",
      },
      {
        target: "settings-modules",
        title: "Borradores",
        body: "Módulos extra guardados. Se insertan a pedido, nunca por defecto.",
      },
    ],
  },
  {
    id: "settings-classifiers",
    title: "Clasificadores",
    steps: [
      {
        target: "settings-classifier-list",
        title: "Opciones",
        body: "Renombrá, agregá opciones o archivá. Archivar no borra las COT viejas; deja de aparecer en las nuevas.",
        editable: "Estos valores son internos. El cliente no los ve.",
      },
    ],
  },
  {
    id: "settings-modules",
    title: "Borradores de módulos",
    steps: [
      {
        target: "settings-module-list",
        title: "Biblioteca",
        body: "Acá viven los módulos extra reutilizables. Se insertan desde Agregar módulo en una COT.",
        editable: "No se agregan solos a cada presupuesto nuevo.",
      },
    ],
  },
  {
    id: "ayuda",
    title: "Tutoriales",
    steps: [
      {
        target: "help-simple",
        title: "Versión simple",
        body: "El flujo en una página: qué se toca, dónde se configura, y cómo reportar un error.",
      },
      {
        target: "help-detailed",
        title: "Versión detallada",
        body: "Cada paso, cada campo, módulos fijos vs IA, Excel histórico y PDF del cliente.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    steps: [
      {
        target: "page-header",
        title: "Inicio",
        body: "Resumen del día. No se edita nada acá: cada número abre esa pantalla.",
      },
      {
        target: "dash-stats",
        title: "Indicadores",
        body: "Productos, solicitudes a responder, importaciones, feedback de IA y tickets abiertos.",
      },
    ],
  },
  {
    id: "requests",
    title: "Solicitudes",
    steps: [
      {
        target: "page-header",
        title: "Bandeja",
        body: "Todo lo que el cliente mandó desde el portal. Abrí una para responder o adjuntar PDF.",
      },
      {
        target: "requests-filters",
        title: "Filtros",
        body: "Estado, tipo, texto y fechas. Las tarjetas de arriba también filtran.",
      },
    ],
  },
  {
    id: "request-detail",
    title: "Una solicitud",
    steps: [
      {
        target: "page-header",
        title: "Cabecera",
        body: "Tipo, cliente y estado. El cliente no ve el editor de cotizaciones.",
      },
      {
        target: "request-reply",
        title: "Responder",
        body: "Texto oficial que ve el cliente en el portal. También queda en la conversación.",
        editable: "Hasta cerrar o rechazar.",
      },
      {
        target: "request-quote",
        title: "Cotización",
        body: "Crear una COT o adjuntar el PDF generado. El cliente solo descarga el PDF.",
      },
    ],
  },
  {
    id: "quotes-history",
    title: "Memoria histórica",
    steps: [
      {
        target: "page-header",
        title: "Excel 5.0",
        body: "Qué se cotizó junto. Sin precios. Al generar una propuesta sugiere compañeros de hoja.",
        editable: "Sólo subir el archivo. No se linkea a productos.",
      },
    ],
  },
  {
    id: "products",
    title: "Productos",
    steps: [
      {
        target: "page-header",
        title: "Catálogo",
        body: "Listado que usan portal, COT e importaciones. El PVP se calcula: no se tipea acá.",
      },
      {
        target: "page-actions",
        title: "Nuevo producto",
        body: "Alta a mano. Lo habitual es importar Excel o sync de marca.",
      },
      {
        target: "products-tabs",
        title: "Crestron Home",
        body: "La otra pestaña marca compatibles. El catálogo general es la primera.",
      },
    ],
  },
  {
    id: "settings-hub",
    title: "Configuración",
    steps: [
      {
        target: "settings-hub",
        title: "Secciones",
        body: "General, marca, precios, cotizaciones, IA, claves y roles. Si no ves una, es el permiso.",
      },
    ],
  },
  {
    id: "tickets",
    title: "Tickets",
    steps: [
      {
        target: "page-header",
        title: "Bandeja del dev",
        body: "Los reportes del chatbot llegan con [Ayuda] y la URL de la pantalla.",
      },
    ],
  },
  {
    id: "generic",
    title: "Esta pantalla",
    steps: [
      {
        target: "page-header",
        title: "Qué es esto",
        body: "Título y para qué sirve el módulo. El chatbot de Ayuda explica cada campo con la documentación.",
      },
      {
        target: "page-actions",
        title: "Acciones",
        body: "Botones de esta pantalla: alta, volver, atajos. Si no hay, pasá al chatbot y preguntá.",
      },
    ],
  },
];

export function resolveTourId(pathname: string, paso?: string | null): string | null {
  if (pathname === "/admin") return "dashboard";
  if (pathname === "/admin/requests") return "requests";
  if (/^\/admin\/requests\/[^/]+$/.test(pathname)) return "request-detail";
  if (pathname === "/admin/quotes") return "quotes-list";
  if (pathname === "/admin/quotes/new") return "quotes-new";
  if (pathname === "/admin/quotes/history") return "quotes-history";
  if (pathname === "/admin/products") return "products";
  if (pathname === "/admin/settings") return "settings-hub";
  if (pathname === "/admin/settings/quotes") return "settings-quotes";
  if (pathname === "/admin/settings/quotes/clasificadores") return "settings-classifiers";
  if (pathname === "/admin/settings/quotes/modulos") return "settings-modules";
  if (pathname === "/admin/changelog") return "generic";
  if (pathname === "/admin/tickets") return "tickets";
  if (pathname === "/admin/ayuda") return "ayuda";
  if (/^\/admin\/quotes\/[^/]+$/.test(pathname) && !pathname.endsWith("/new") && !pathname.endsWith("/print")) {
    const step = Number(paso || "2");
    if (step === 1) return "quote-datos";
    if (step === 2) return "quote-brief";
    if (step === 3) return "quote-plantilla";
    if (step === 4) return "quote-planilla";
    if (step === 5) return "quote-textos";
    if (step === 6) return "quote-imagenes";
    if (step === 7) return "quote-emitir";
    return "quote-datos";
  }
  return "generic";
}

export function getTour(id: string | null) {
  return TOURS.find((tour) => tour.id === id) || null;
}

export function resolveTour(pathname: string, paso?: string | null): TourDef | null {
  const id = resolveTourId(pathname, paso);
  const tour = getTour(id);
  if (tour && tour.id !== "generic") return tour;

  const mod = moduleForPath(pathname);
  return {
    id: `mod-${mod.id}`,
    title: mod.title,
    steps: [
      {
        target: "page-header",
        title: mod.title,
        body: `${mod.simple} ${mod.purpose}`,
        editable: mod.editable,
      },
      {
        target: "page-actions",
        title: "Acciones de esta pantalla",
        body: mod.fields.slice(0, 2).join(" ") || "Botones de alta, filtros o atajos.",
        editable: mod.notEditable,
      },
    ],
  };
}
