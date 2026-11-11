import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { loadPublicForm } from "@/lib/forms/public";
import { prisma } from "@/lib/prisma";
import { formDoneCookie, readSettings } from "@/lib/forms/types";
import { appUrl } from "@/lib/app-url";
import { ogImageUrl } from "@/lib/og/meta";
import { getCurrentPermissions, getSessionUser } from "@/lib/auth-helpers";
import { isPanelRole, permissionsHave } from "@/lib/permissions";
import { FormRunner } from "./form-runner";

export const dynamic = "force-dynamic";

/** Isologo de Soundtec (azul): el del encabezado de cotizaciones es una imagen ancha. */
const LOGO = "/landing/logo_soundtec.png";

function closedLogo(url: string | undefined): string {
  return url ? `/api/forms/logo?u=${encodeURIComponent(url)}` : LOGO;
}

/** Invitado del enlace personal (?i=…): se anota la primera vez que lo abre. */
async function openInvite(formId: string, code: string | undefined) {
  if (!code || !/^[A-Za-z0-9_-]{8,40}$/.test(code)) return null;
  const invite = await prisma.formInvite.findFirst({
    where: { formId, code },
    select: { id: true, code: true, email: true, name: true, company: true, openedAt: true, respondedAt: true },
  });
  if (invite && !invite.openedAt) {
    await prisma.formInvite.update({ where: { id: invite.id }, data: { openedAt: new Date() } }).catch((error) => console.error("[forms] No se pudo anotar la apertura", error));
  }
  return invite;
}

/**
 * Formulario público por enlace secreto: no se indexa ni se lista en ningún lado.
 * Lo que sí lleva es la vista previa al compartirlo (WhatsApp, redes): título,
 * fecha y lugar, y la imagen con el logo del evento sobre la red de puntos.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  // Solo lo necesario: armar el formulario entero (marcas, mapas) acá duplicaba el trabajo de la página.
  const form = /^[A-Za-z0-9_-]{16,64}$/.test(token) ? await prisma.form.findUnique({ where: { token }, select: { title: true, settings: true, updatedAt: true } }) : null;
  if (!form) return { title: { absolute: "Soundtec" }, robots: { index: false, follow: false, nocache: true } };
  const settings = readSettings(form.settings);
  const title = settings.welcomeTitle?.trim() || form.title;
  const details = (settings.endInfo ?? [])
    .filter((d) => /^(fecha|d[ií]a|horario|hora|lugar|sal[oó]n|sede|direcci[oó]n)$/i.test(d.label.trim()) && d.value.trim())
    .map((d) => d.value.trim())
    .join(" · ");
  const intro = (settings.welcomeBody ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const description = (details || intro || "Completá el formulario de Soundtec.").slice(0, 200);
  // ?v= cambia cuando se edita el formulario: WhatsApp guarda la imagen por URL y así toma la nueva.
  const image = ogImageUrl(`/api/forms/og/${token}`, form.updatedAt);
  return {
    title: { absolute: `${title} · Soundtec` },
    description,
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
    openGraph: {
      type: "website",
      siteName: "Soundtec",
      locale: "es_AR",
      title,
      description,
      url: `${appUrl()}/f/${token}`,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}


/** ?previa=1 con sesión del equipo (permiso de formularios): se ve aunque esté en borrador y no envía. */
async function canPreview(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user || !isPanelRole(user.role)) return false;
  const { permissions } = await getCurrentPermissions();
  return permissions.fullAccess || permissionsHave(permissions, "forms.manage");
}

export default async function PublicFormPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams?: Promise<{ previa?: string; i?: string }> }) {
  const { token } = await params;
  const sp = searchParams ? await searchParams : {};
  const preview = sp.previa === "1" && (await canPreview());
  const form = await loadPublicForm(token, { preview });
  if (!form) notFound();
  const invite = preview ? null : await openInvite(form.id, sp.i);
  // Quien ya respondió ve la confirmación (con la info del evento) aunque el formulario ya esté cerrado.
  // Con su enlace personal se lo reconoce desde cualquier dispositivo; si no, por la cookie de este navegador.
  const alreadyDone = !preview && (Boolean(invite?.respondedAt) || (await cookies()).get(formDoneCookie(form.id))?.value === "1");

  if (!form.open && !alreadyDone) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-white px-6 text-center text-[#13233a]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={closedLogo(form.settings.logoUrl || form.settings.welcomeImageUrl)} alt={form.title} className="h-14 w-auto max-w-[280px] object-contain" />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{form.title}</h1>
        <p className="max-w-md text-lg text-[#13233a]/70">{form.closedReason}</p>
      </div>
    );
  }

  return (
    <FormRunner
      token={form.token}
      title={form.title}
      logoUrl={LOGO}
      settings={form.settings}
      blocks={form.blocks}
      preview={preview}
      alreadyDone={alreadyDone}
      canRestart={form.open}
      invite={invite ? { code: invite.code, email: invite.email, name: invite.name ?? "", company: invite.company ?? "" } : undefined}
    />
  );
}
