export type TutorialBlock = {
  title: string;
  body: string[];
};

export type TutorialArticle = {
  id: string;
  title: string;
  summary: string;
  blocks: TutorialBlock[];
};

export const TUTORIAL_SIMPLE: TutorialArticle[] = [
  {
    id: "flujo",
    title: "El flujo de una cotización",
    summary: "De la idea al PDF que ve el cliente.",
    blocks: [
      {
        title: "En una frase",
        body: [
          "Clasificás la COT (tipo de sala + escala), armás el documento, y cuando está lista adjuntás un PDF a la solicitud. El cliente no entra al editor.",
        ],
      },
      {
        title: "Pasos",
        body: [
          "1. Nueva cotización: tipo, escala y un prompt si querés.",
          "2. Datos: cliente, referencia, contacto.",
          "3. Brief y planos: generar propuesta con IA (opcional).",
          "4. Plantilla: qué módulos van. Podés agregar módulos extra.",
          "5. Planilla: productos. Si es una casa, un ambiente por zona.",
          "6. Textos e imágenes: retocás en el documento.",
          "7. Emitir o adjuntar PDF a la solicitud.",
        ],
      },
    ],
  },
  {
    id: "que-se-edita",
    title: "Qué se puede tocar y qué no",
    summary: "Regla corta para no romper la plantilla.",
    blocks: [
      {
        title: "Sí se edita en cada COT",
        body: [
          "Textos de propuesta, criterios, productos, precios, fotos de esa COT, módulos extra, ambientes y clasificación interna.",
        ],
      },
      {
        title: "No se pisa solo",
        body: [
          "Presentación Soundtec, marcas, ISO, condiciones, garantía y cierre. Son texto fijo. Un revise explícito sí puede cambiarlos en ESA cotización; la plantilla maestra no se toca.",
        ],
      },
      {
        title: "El cliente",
        body: [
          "Solo descarga el PDF generado. No ve el editor ni una vista HTML editable.",
        ],
      },
    ],
  },
  {
    id: "donde-configurar",
    title: "Dónde se configura",
    summary: "Todo vive en Admin → Configuración.",
    blocks: [
      {
        title: "Atajos",
        body: [
          "Cotizaciones: numeración, logo, condiciones, plantilla visual.",
          "Clasificadores: tipo de sala, escala y opciones nuevas.",
          "Borradores de módulos: módulos extra reutilizables.",
          "Prompts y modelos / Integraciones: claves de OpenAI y Serper.",
          "Memoria histórica: Excel de planillas viejas (Cotizaciones → Historial).",
        ],
      },
    ],
  },
  {
    id: "tour-y-ticket",
    title: "Recorrido en pantalla y ticket al dev",
    summary: "La pantalla se oscurece y señala cada botón.",
    blocks: [
      {
        title: "Cómo se usa",
        body: [
          "Abajo a la derecha: Ayuda. Ahí está Tutorial simple, Tutorial detallado, Recorrer esta pantalla y Reportar al dev.",
          "Recorrer esta pantalla oscurece todo y apunta al campo o botón. Siguiente / atrás / saltar.",
          "Si ese control no hace lo que dice el globo, «Esto no funciona» arma un ticket con la URL y el paso.",
        ],
      },
    ],
  },
];

export const TUTORIAL_DETAILED: TutorialArticle[] = [
  {
    id: "mapa",
    title: "Mapa de la plataforma (cotizaciones)",
    summary: "Pantallas, para qué sirven y quién las usa.",
    blocks: [
      {
        title: "Operación diaria",
        body: [
          "Solicitudes: el cliente pide; el equipo responde y puede adjuntar un PDF de COT.",
          "Cotizaciones: el editor interno. Acá se escribe, se genera IA y se emite.",
          "Nueva cotización: alta. Reserva número y deja la plantilla lista.",
          "Tickets al dev: fallas o pedidos técnicos. También se abre desde Ayuda en cualquier pantalla.",
        ],
      },
      {
        title: "Configuración",
        body: [
          "Configuración → Cotizaciones: numeración, identidad del documento (logo, marcas, ISO), condiciones comerciales por defecto, perfil de contenido (resumido / técnico / premium).",
          "Configuración → Cotizaciones → Plantilla visual: textos fijos de las COT NUEVAS. Las ya creadas no se reescriben.",
          "Configuración → Cotizaciones → Clasificadores: los seleccionables del inicio (tipo, escala, etc.).",
          "Configuración → Cotizaciones → Borradores de módulos: biblioteca de módulos extra. No entran solos.",
          "Configuración → Prompts y modelos / Integraciones: OpenAI, Serper, DALL·E.",
        ],
      },
    ],
  },
  {
    id: "clasificadores",
    title: "Clasificación interna (tipo y escala)",
    summary: "Trabajo interno. El cliente no lo ve.",
    blocks: [
      {
        title: "Para qué sirve",
        body: [
          "Marca la COT: por ejemplo «Sala de videoconferencia» + «Mediana».",
          "Cuando pedís una grande, la IA parte de las medianas del mismo tipo y suma lo que falte.",
          "Sin prompt: el panel Memoria interna sugiere equipos que se usaron en COT con la misma (o parecida) clasificación.",
        ],
      },
      {
        title: "Dónde se elige",
        body: [
          "Al crear la COT, arriba de todo.",
          "Después, en el paso Datos de esa COT. Guardá la clasificación para que las sugerencias se actualicen.",
        ],
      },
      {
        title: "Dónde se editan las opciones",
        body: [
          "Configuración → Cotizaciones → Clasificadores.",
          "Podés renombrar, agregar opciones, crear otro clasificador (ej. Nivel de integración) o archivar.",
          "Archivar no borra las COT viejas; deja de aparecer en las nuevas.",
        ],
      },
      {
        title: "Qué no hace",
        body: [
          "No copia precios de otra COT.",
          "No elige sola una planilla histórica del Excel por cliente.",
          "La primera COT de una combinación no tiene de dónde sugerir; la segunda sí.",
        ],
      },
    ],
  },
  {
    id: "wizard",
    title: "Los 7 pasos del editor",
    summary: "Qué hay en cada paso, qué se edita y qué queda bloqueado.",
    blocks: [
      {
        title: "1. Datos",
        body: [
          "Clasificación interna (arriba).",
          "Cliente: hace falta para emitir. Sin cliente podés trabajar el borrador.",
          "Contacto y referencia: salen en la carta.",
          "Layout visual (Compacto / Estándar / Editorial): se guarda; hoy el documento usa el mismo diseño A4.",
          "Columna entrega y alternativas: opciones de esta COT.",
          "Editable hasta emitir. Emitida: solo lectura.",
        ],
      },
      {
        title: "2. Brief y planos",
        body: [
          "Brief / prompt: el problema a resolver. La IA lo usa para propuesta y para inferir clasificadores si el texto nombra «mediana», «videoconferencia», etc.",
          "Planos: PDF o fotos. La IA puede leerlos al generar.",
          "Generar propuesta con IA: completa módulos de proyecto (propuesta, criterios, productos clave, funcionalidad). No pisa texto fijo. No inventa precios.",
          "Memoria interna: sugerencias de equipos de COT parecidas o del Excel histórico.",
        ],
      },
      {
        title: "3. Plantilla",
        body: [
          "Incluido / No va: apaga un módulo de ESTA cotización.",
          "La planilla de productos siempre va.",
          "Agregar módulo: título + cuerpo a mano o con prompt. Opcional: guardar como borrador para otras COT (no entra solo).",
          "En el documento: clickeá y escribí. Pills «Texto fijo» vs «IA» vs «Módulo extra».",
          "Fotos del módulo: subir, Serper o generar. Layout: izquierda, derecha, arriba, abajo, dos en fila.",
        ],
      },
      {
        title: "4. Planilla",
        body: [
          "Productos del catálogo y servicios a mano.",
          "Nombre en negrita + descripción corta del producto. Regenerar descripción la guarda en el catálogo.",
          "Agregar ambiente: otra tabla (habitación, cocina…) con su explicación y subtotal. Al final, total general.",
          "Mover un ítem de ambiente con el selector de la fila.",
          "Quitar ambiente: los equipos vuelven a «general».",
          "Accesorios del catálogo: relaciones fijas producto-accesorio, no vienen del Excel.",
        ],
      },
      {
        title: "5. Textos",
        body: [
          "Módulos de proyecto. Fijar evita que «Generar propuesta» los pise.",
          "Seguí editando en el documento de la derecha.",
        ],
      },
      {
        title: "6. Imágenes",
        body: [
          "Foto de producto: catálogo, Serper o archivo. Es de ESTA COT.",
          "Aplicación / esquemas: galería suelta al final del documento. Las fotos de un módulo extra no se duplican acá.",
          "Collage de marcas e ISO: corporativos, se configuran en Cotizaciones (settings), no por COT.",
        ],
      },
      {
        title: "7. Emitir",
        body: [
          "Condiciones: del sistema, las del cliente anterior, o nuevas para esta COT.",
          "Emitir congela la COT. Para cambiar, no se edita la emitida: se trabaja otra versión.",
          "Al emitir se genera un PDF snapshot.",
        ],
      },
    ],
  },
  {
    id: "modulos",
    title: "Módulos: fijos, IA y extra",
    summary: "Tres familias. No se mezclan.",
    blocks: [
      {
        title: "Texto fijo (plantilla)",
        body: [
          "Apertura, presentación, marcas, instalación, personal, condiciones, garantías, ISO, cierre.",
          "Se edita la maestra en Configuración → Plantilla visual. Aplica a COT nuevas.",
          "En una COT ya creada podés retocar a mano o con «Hacelo más claro…». Eso no cambia la maestra.",
          "Generar propuesta NO los reescribe.",
        ],
      },
      {
        title: "IA (proyecto)",
        body: [
          "Propuesta, criterios, productos clave, funcionalidad.",
          "Vacío hasta que generás o escribís. La IA no inventa precios ni equipos que no estén en catálogo.",
        ],
      },
      {
        title: "Módulos extra",
        body: [
          "Los creás vos. Título, cuerpo, fotos, layout.",
          "Si los guardás como borrador, en la próxima COT los insertás a pedido.",
          "No se agregan solos a cada presupuesto nuevo.",
        ],
      },
    ],
  },
  {
    id: "ia-memoria",
    title: "IA, Excel histórico y memoria",
    summary: "Tres memorias distintas. No se confunden.",
    blocks: [
      {
        title: "Clasificadores (COT nuevas)",
        body: [
          "Compara COT de la plataforma con el mismo tipo/escala. Sugiere productos reales del catálogo con botón Agregar.",
        ],
      },
      {
        title: "Excel de planillas (Memoria histórica)",
        body: [
          "Cotizaciones → Historial. Subís el Excel 5.0. Cada hoja = qué se cotizó junto (texto + cantidad). Sin precios.",
          "No se linkea cada línea a un producto del catálogo.",
          "Al generar, busca modelo/SKU en esas descripciones y sugiere compañeros de la misma hoja.",
        ],
      },
      {
        title: "Accesorios de catálogo",
        body: [
          "Relaciones producto ↔ accesorio cargadas en el catálogo. Aparecen en Planilla con Agregar.",
        ],
      },
      {
        title: "Regenerar descripción corta",
        body: [
          "En la planilla o en la ficha del producto. Reescribe y GUARDA en el producto. La próxima COT usa esa versión.",
        ],
      },
    ],
  },
  {
    id: "cliente-pdf",
    title: "Cliente y PDF",
    summary: "El cliente no edita.",
    blocks: [
      {
        title: "Adjuntar",
        body: [
          "En la solicitud: Adjuntar PDF como respuesta. Se genera un snapshot en ese momento.",
          "El cliente ve «Descargar PDF». Links viejos de «abrir cotización» también bajan el PDF.",
          "El equipo sigue abriendo el editor desde admin.",
        ],
      },
      {
        title: "Qué no puede el cliente",
        body: [
          "No entra al live editor, no cambia textos, no ve módulos apagados ni precios en vivo del borrador.",
        ],
      },
    ],
  },
  {
    id: "campos",
    title: "Campos: para qué sirven",
    summary: "Lista práctica de los campos que más se tocan.",
    blocks: [
      {
        title: "Alta / Datos",
        body: [
          "Tipo de sala / Escala: memoria interna. No salen en el PDF.",
          "Cliente: bloquea emitir si falta.",
          "Referencia: el «Ref:» de la carta.",
          "Qué querés armar / Brief: prompt para la IA.",
          "Perfil de contenido: qué módulos vienen tildados al crear (resumido / técnico / premium).",
        ],
      },
      {
        title: "Planilla",
        body: [
          "Cantidad, precio, IVA, entrega: de esa línea.",
          "Descripción de línea: texto de la planilla. La descripción corta del producto es otra cosa (catálogo).",
          "Opcional: no suma al total.",
          "Fijar: la IA de ítem no lo pisa.",
          "Ambiente: agrupa en otra tabla.",
        ],
      },
      {
        title: "Settings de cotizaciones",
        body: [
          "Prefijo: las letras del número (COT).",
          "Incluir fecha / formato / separador / dígitos: cómo se arma COT-2026-00012.",
          "Siguiente número: el correlativo. Cambiarlo puede duplicar números.",
          "Layout por defecto: Compacto / Estándar / Editorial (se guarda; el PDF usa el mismo A4).",
          "Perfil de contenido: qué módulos de proyecto vienen tildados (resumido / técnico / premium).",
          "IVA % y columna entrega: defaults de la planilla.",
          "Opciones de entrega: una por línea (ej. 15 días, stock).",
          "Vigencia, forma de pago, referencia de pago, garantía: se copian a cada COT nueva; el vendedor las puede ajustar.",
          "Tagline, dirección, teléfono, mail, web: pie e identidad.",
          "Rutas de logo / pie / marcas / ISO: imágenes corporativas. No son fotos de producto.",
        ],
      },
    ],
  },
  {
    id: "recorrido",
    title: "Recorrido interactivo",
    summary: "La pantalla se oscurece y señala el control.",
    blocks: [
      {
        title: "Dónde se abre",
        body: [
          "Botón Ayuda, abajo a la derecha, en todo el admin. No sale al imprimir.",
          "Recorrer esta pantalla: si hay un tour para esa URL (y el paso del wizard), arranca.",
          "También: Tutorial → Recorrer alta de COT / Recorrer configuración, o agregá ?tour=1 a la URL.",
        ],
      },
      {
        title: "Qué hace cada globo",
        body: [
          "Título del control, para qué sirve, y un recuadro «Se edita» si aplica.",
          "Siguiente / atrás (también flechas del teclado). Escape o Saltar cierra.",
          "Si el control no está (COT emitida, otro paso, sin permiso), el globo lo dice.",
        ],
      },
      {
        title: "Pantallas con recorrido",
        body: [
          "Lista de COT, nueva COT, cada paso del editor (datos, brief, plantilla, planilla, textos, imágenes, emitir).",
          "Configuración de cotizaciones, clasificadores, borradores de módulos, y esta página de Ayuda.",
        ],
      },
    ],
  },
  {
    id: "errores",
    title: "Si algo falla",
    summary: "Ticket rápido al desarrollador.",
    blocks: [
      {
        title: "Desde cualquier pantalla",
        body: [
          "Botón Ayuda (abajo a la derecha) → Reportar al dev.",
          "Se manda la URL, la pantalla y lo que escribas. Prioridad alta si es un error.",
        ],
      },
      {
        title: "Durante el recorrido",
        body: [
          "Si el recuadro señala un botón que no existe o no hace lo que dice el tutorial, usá «Esto no funciona» en el mismo globo.",
        ],
      },
      {
        title: "Lista de tickets",
        body: [
          "Admin → Tickets al dev. Ahí se ven abiertos, en progreso y resueltos.",
        ],
      },
    ],
  },
];
