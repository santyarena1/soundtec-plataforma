/**
 * Textos de cada mail del portal. Puros: reciben los datos y la URL del
 * portal, devuelven asunto + HTML + texto plano.
 */
import { SOUNDTEC_PHONE, SOUNDTEC_SALES_EMAIL } from "@/lib/company-contact";
import { renderTransactional, type MailDetail, type RenderedMail } from "./template";

const firstName = (name: string | null | undefined) => String(name ?? "").trim().split(/\s+/)[0] || "";
const hello = (name: string | null | undefined) => (firstName(name) ? `Hola ${firstName(name)},` : "Hola,");

export function formatArDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "long", timeStyle: "short" }).format(date);
}

const CONTACT_LINE = `Si tenés dudas, respondé este mail o llamanos al ${SOUNDTEC_PHONE}.`;

// ── Mails a clientes y usuarios ──────────────────────────────────────────────

export function accessInviteMail(input: { name: string; url: string; kind: "staff" | "portal" }, portalUrl: string): RenderedMail {
  if (input.kind === "staff") {
    return renderTransactional(
      {
        subject: "Tu usuario en el panel de Soundtec",
        kicker: "Acceso al panel",
        title: "Ya tenés usuario en el panel",
        paragraphs: [
          `${hello(input.name)} te dimos un usuario en el panel interno de Soundtec.`,
          "Para entrar, creá tu contraseña desde el botón. El link es personal y vence en 72 horas.",
        ],
        button: { label: "Crear mi contraseña", url: input.url },
        note: "Si no esperabas este mail, ignoralo: sin crear la contraseña nadie puede entrar con tu usuario.",
      },
      portalUrl
    );
  }
  return renderTransactional(
    {
      subject: "Tu acceso al portal de clientes de Soundtec",
      kicker: "Acceso al portal",
      title: "Ya tenés acceso al portal",
      paragraphs: [
        `${hello(input.name)} te dimos acceso al portal de clientes de Soundtec: ahí ves el catálogo con tus precios y condiciones, armás pedidos y seguís tus cotizaciones.`,
        "Para entrar, creá tu contraseña desde el botón. El link es personal y vence en 72 horas.",
      ],
      button: { label: "Crear mi contraseña", url: input.url },
      note: `Si no esperabas este mail, ignoralo: sin crear la contraseña nadie puede entrar con tu cuenta. ${CONTACT_LINE}`,
    },
    portalUrl
  );
}

export function accountApprovedMail(input: { name: string; company: string; url: string }, portalUrl: string): RenderedMail {
  return renderTransactional(
    {
      subject: "Aprobamos tu cuenta en el portal de Soundtec",
      kicker: "Cuenta aprobada",
      title: `La cuenta de ${input.company} está lista`,
      paragraphs: [
        `${hello(input.name)} aprobamos la cuenta de ${input.company} en el portal de clientes de Soundtec.`,
        "Creá tu contraseña desde el botón y ya podés ver precios, armar pedidos y pedir cotizaciones. El link es personal y vence en 72 horas.",
      ],
      button: { label: "Crear mi contraseña", url: input.url },
      note: `Si el link venció, respondé este mail y te mandamos uno nuevo. Tel. ${SOUNDTEC_PHONE}.`,
    },
    portalUrl
  );
}

export function accountRequestReceivedMail(input: { name: string; company: string }, portalUrl: string): RenderedMail {
  return renderTransactional(
    {
      subject: "Recibimos tu solicitud de cuenta en Soundtec",
      kicker: "Solicitud recibida",
      title: "Estamos revisando tu solicitud",
      paragraphs: [
        `${hello(input.name)} recibimos el pedido de cuenta para ${input.company} en el portal de clientes de Soundtec.`,
        "La revisa el equipo comercial. Cuando esté aprobada te llega otro mail con el link para crear tu contraseña.",
      ],
      note: `Si te equivocaste en algún dato, respondé este mail y lo corregimos. También podés llamarnos al ${SOUNDTEC_PHONE}.`,
    },
    portalUrl
  );
}

export function accountRejectedMail(input: { name: string; company: string }, portalUrl: string): RenderedMail {
  return renderTransactional(
    {
      subject: "Sobre tu solicitud de cuenta en Soundtec",
      kicker: "Solicitud de cuenta",
      title: "Por ahora no pudimos aprobar la cuenta",
      paragraphs: [
        `${hello(input.name)} revisamos la solicitud de cuenta para ${input.company} y por ahora no la pudimos aprobar.`,
        `Si querés contarnos más sobre tu empresa o creés que hubo un error, respondé este mail o escribinos a ${SOUNDTEC_SALES_EMAIL}.`,
      ],
      note: `También podés llamarnos al ${SOUNDTEC_PHONE}.`,
    },
    portalUrl
  );
}

export const PASSWORD_RESET_MINUTES = 60;

export function passwordResetMail(input: { name: string; email: string; url: string; twoFactor: boolean }, portalUrl: string): RenderedMail {
  const paragraphs = [
    `${hello(input.name)} pidieron restablecer la contraseña de tu cuenta (${input.email}) en el portal de Soundtec.`,
    "Elegí una nueva desde el botón. El link sirve una sola vez y vence en 1 hora.",
  ];
  if (input.twoFactor) paragraphs.push("Tu cuenta tiene verificación en dos pasos: después de cambiar la clave, al ingresar te vamos a seguir pidiendo el código de tu app.");
  return renderTransactional(
    {
      subject: "Restablecé tu contraseña de Soundtec",
      kicker: "Recuperar acceso",
      title: "Elegí una contraseña nueva",
      paragraphs,
      button: { label: "Elegir contraseña nueva", url: input.url },
      note: `Si no lo pediste vos, ignorá este mail: tu contraseña sigue igual y nadie puede cambiarla sin este link. ${CONTACT_LINE}`,
    },
    portalUrl
  );
}

export function passwordChangedMail(input: { name: string; email: string; when: Date }, portalUrl: string): RenderedMail {
  return renderTransactional(
    {
      subject: "Cambiaste tu contraseña de Soundtec",
      kicker: "Seguridad de tu cuenta",
      title: "Tu contraseña se cambió",
      paragraphs: [
        `${hello(input.name)} la contraseña de tu cuenta (${input.email}) se cambió el ${formatArDateTime(input.when)} desde el link de recuperación.`,
        "Por seguridad cerramos las sesiones que estaban abiertas en otros dispositivos.",
      ],
      note: `Si no fuiste vos, escribinos ya a ${SOUNDTEC_SALES_EMAIL} o llamanos al ${SOUNDTEC_PHONE}.`,
    },
    portalUrl
  );
}

export function testMail(input: { sender: string; replyTo?: string; channel: string; when: Date }, portalUrl: string): RenderedMail {
  return renderTransactional(
    {
      subject: "Prueba de correo del portal Soundtec",
      kicker: "Prueba de envío",
      title: "El correo del portal funciona",
      paragraphs: [
        `Si estás leyendo esto, los mails del portal salen bien desde ${input.sender}.`,
        input.replyTo ? `Cuando un cliente responde, la respuesta va a ${input.replyTo}.` : `Cuando un cliente responde, la respuesta vuelve a ${input.sender}.`,
      ],
      details: [
        { label: "Canal", value: input.channel },
        { label: "Enviado", value: formatArDateTime(input.when) },
      ],
      note: "Lo mandaste desde Configuración › Correo. Revisá que no haya caído en spam.",
      internal: true,
    },
    portalUrl
  );
}

// ── Avisos internos al equipo ────────────────────────────────────────────────

function notice(input: { subject: string; title: string; lead: string; details: MailDetail[]; button: { label: string; url: string } }, portalUrl: string): RenderedMail {
  return renderTransactional({ subject: input.subject, kicker: "Aviso del portal", title: input.title, paragraphs: [input.lead], details: input.details, button: input.button, internal: true }, portalUrl);
}

export function accountRequestNotice(
  input: { fullName: string; company: string; cuit: string; email: string; phone: string; activity: string; requestedBy?: string | null },
  portalUrl: string
): RenderedMail {
  return notice(
    {
      subject: `Nueva solicitud de cuenta: ${input.company}`,
      title: `${input.company} pidió cuenta`,
      lead: input.requestedBy ? `${input.requestedBy} pidió el alta de una empresa nueva. Queda pendiente hasta que la apruebe un admin.` : "Llegó una solicitud de cuenta desde la web. Queda pendiente hasta que la revisen.",
      details: [
        { label: "Empresa", value: input.company },
        { label: "CUIT", value: input.cuit },
        { label: "Contacto", value: input.fullName },
        { label: "Mail", value: input.email },
        { label: "Teléfono", value: input.phone },
        { label: "Actividad", value: input.activity },
      ],
      button: { label: "Revisar solicitud", url: `${portalUrl}/admin/account-requests` },
    },
    portalUrl
  );
}

export function orderNotice(input: { id: string; client: string; user: string; items: number; description?: string | null }, portalUrl: string): RenderedMail {
  return notice(
    {
      subject: `Pedido nuevo de ${input.client} (${input.items} ${input.items === 1 ? "ítem" : "ítems"})`,
      title: `Pedido nuevo de ${input.client}`,
      lead: `${input.user} envió un pedido desde el portal.`,
      details: [
        { label: "Cliente", value: input.client },
        { label: "Lo envió", value: input.user },
        { label: "Ítems", value: String(input.items) },
        { label: "Descripción", value: (input.description ?? "").slice(0, 600) },
      ],
      button: { label: "Abrir el pedido", url: `${portalUrl}/admin/requests/${input.id}` },
    },
    portalUrl
  );
}

export function leadNotice(input: { name?: string | null; company?: string | null; email?: string | null; phone?: string | null; projectInfo?: string | null }, portalUrl: string): RenderedMail {
  const who = input.company || input.name || input.email || "un visitante";
  return notice(
    {
      subject: `Lead nuevo en Expo: ${who}`,
      title: `Lead nuevo: ${who}`,
      lead: "Un visitante dejó sus datos en el asistente de la Expo.",
      details: [
        { label: "Nombre", value: input.name ?? "" },
        { label: "Empresa", value: input.company ?? "" },
        { label: "Mail", value: input.email ?? "" },
        { label: "Teléfono", value: input.phone ?? "" },
        { label: "Proyecto", value: (input.projectInfo ?? "").slice(0, 600) },
      ],
      button: { label: "Ver leads", url: `${portalUrl}/admin/assistant/leads` },
    },
    portalUrl
  );
}

export function formResponseNotice(input: { formId: string; formTitle: string; answers: MailDetail[] }, portalUrl: string): RenderedMail {
  return notice(
    {
      subject: `Respuesta nueva: ${input.formTitle}`,
      title: input.formTitle,
      lead: "Llegó una respuesta nueva al formulario.",
      details: input.answers.slice(0, 12).map((a) => ({ label: a.label.slice(0, 80), value: a.value.slice(0, 400) })),
      button: { label: "Ver respuestas", url: `${portalUrl}/admin/forms/${input.formId}` },
    },
    portalUrl
  );
}

const PRIORITY_LABEL: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente" };

export function ticketNotice(input: { title: string; priority: string; author: string; description: string }, portalUrl: string): RenderedMail {
  return notice(
    {
      subject: `Ticket nuevo (${PRIORITY_LABEL[input.priority] ?? input.priority}): ${input.title}`,
      title: input.title,
      lead: `${input.author} cargó un ticket.`,
      details: [
        { label: "Prioridad", value: PRIORITY_LABEL[input.priority] ?? input.priority },
        { label: "Detalle", value: input.description.slice(0, 1500) },
      ],
      button: { label: "Ver tickets", url: `${portalUrl}/admin/tickets` },
    },
    portalUrl
  );
}
