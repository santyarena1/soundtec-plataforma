"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowRight, Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { formTheme, type FormTheme } from "./form-theme";
import { FormParticles } from "./form-particles";
import { AgendaList, InfoList, MapPanel, MapPreload } from "./event-info";
import { submitFormResponse } from "@/server/actions/form-submit";
import {
  OTHER_PREFIX,
  isQuestionType,
  mapOpenUrl,
  validateAnswer,
  videoEmbedUrl,
  type AnswerValue,
  type FormSettings,
  type PublicBlock,
} from "@/lib/forms/types";

type StepItem = { block: PublicBlock; number: number | null };
/** Una pantalla puede juntar varios bloques («En la misma pantalla que la anterior»). */
type Step = { kind: "welcome" } | { kind: "block"; items: StepItem[] } | { kind: "end" };

const FADE_MS = 420;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Formulario a pantalla completa, una pantalla por vez con fundido entre
 * preguntas (al estilo Typeform). Las respuestas viajan juntas al final.
 */
export function FormRunner({
  token,
  title,
  logoUrl,
  settings,
  blocks,
  preview = false,
  alreadyDone = false,
  canRestart = true,
  invite,
}: {
  token: string;
  title: string;
  logoUrl: string;
  settings: FormSettings;
  blocks: PublicBlock[];
  /** Vista previa del panel: no envía. */
  preview?: boolean;
  /** Ya respondió desde este navegador: arranca en la pantalla de confirmación. */
  alreadyDone?: boolean;
  /** Falso si el formulario ya cerró: se ve la confirmación pero no se puede responder de nuevo. */
  canRestart?: boolean;
  /** Invitado por mail (enlace personal): sus datos vienen completados y la respuesta queda vinculada. */
  invite?: { code: string; email: string; name: string; company: string };
}) {
  const theme = formTheme(settings);
  const dark = theme.dark;
  // La imagen de la bienvenida también cuenta como logo del formulario (antes eran dos campos).
  const formLogo = settings.logoUrl || settings.welcomeImageUrl;
  const customLogo = Boolean(formLogo);
  // El logo propio pasa por /api/forms/logo, que le saca el fondo blanco (si era un JPG).
  const headerLogo = formLogo ? `/api/forms/logo?u=${encodeURIComponent(formLogo)}${dark ? "&fondo=oscuro" : ""}` : logoUrl;
  const steps = useMemo<Step[]>(() => {
    let n = 0;
    const list: Step[] = [];
    if (settings.welcomeTitle || settings.welcomeBody || settings.welcomeImageUrl) list.push({ kind: "welcome" });
    for (const block of blocks) {
      const item = { block, number: isQuestionType(block.type) ? ++n : null };
      const prev = list[list.length - 1];
      if (block.config.groupWithPrevious && prev?.kind === "block") prev.items.push(item);
      else list.push({ kind: "block", items: [item] });
    }
    list.push({ kind: "end" });
    return list;
  }, [blocks, settings.welcomeTitle, settings.welcomeBody, settings.welcomeImageUrl]);

  const [index, setIndex] = useState(() => (alreadyDone ? steps.length - 1 : 0));
  const [restarted, setRestarted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [direction, setDirection] = useState<1 | -1>(1);
  const initialAnswers = useMemo(() => prefillFromInvite(blocks, invite), [blocks, invite]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(initialAnswers);
  // Copia sincrónica: al elegir una opción se avanza enseguida y el estado todavía no se actualizó.
  const answersRef = useRef<Record<string, AnswerValue>>(initialAnswers);
  const [error, setError] = useState<string | null>(null);
  // En una pantalla con varios campos, el error se muestra debajo del campo que falló.
  const [errorBlockId, setErrorBlockId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hp, setHp] = useState("");
  const busy = useRef(false);

  const step = steps[index];
  const lastQuestionIndex = steps.length - 2;
  const questionTotal = blocks.filter((b) => isQuestionType(b.type)).length;
  const answered = blocks.filter((b) => isQuestionType(b.type) && answers[b.id] != null && answers[b.id] !== "").length;
  const progress = step.kind === "end" ? 100 : questionTotal ? Math.round((answered / questionTotal) * 100) : Math.round((index / (steps.length - 1)) * 100);

  const goTo = useCallback(
    (next: number) => {
      if (busy.current || next < 0 || next >= steps.length || next === index) return;
      busy.current = true;
      setDirection(next > index ? 1 : -1);
      setVisible(false);
      window.setTimeout(() => {
        setIndex(next);
        setError(null);
        setErrorBlockId(null);
        setVisible(true);
        window.setTimeout(() => (busy.current = false), FADE_MS);
      }, FADE_MS);
    },
    [index, steps.length]
  );

  const submit = useCallback(async () => {
    if (preview) {
      goTo(steps.length - 1);
      return;
    }
    setSending(true);
    const result = await submitFormResponse({ token, answers: answersRef.current, hp, inviteCode: invite?.code });
    setSending(false);
    if (!result.ok) {
      const target = result.blockId ? steps.findIndex((s) => s.kind === "block" && s.items.some((i) => i.block.id === result.blockId)) : -1;
      if (target >= 0 && target !== index) goTo(target);
      // Después del fundido (goTo limpia el error al cambiar de pantalla).
      window.setTimeout(() => {
        setError(result.error);
        setErrorBlockId(result.blockId ?? null);
      }, target >= 0 && target !== index ? FADE_MS * 2 + 20 : 0);
      return;
    }
    goTo(steps.length - 1);
  }, [goTo, hp, index, preview, steps, token]);

  const next = useCallback(() => {
    // En la vista previa se puede recorrer todo sin completar lo obligatorio.
    if (step.kind === "block" && !preview) {
      for (const { block } of step.items) {
        if (!isQuestionType(block.type)) continue;
        const check = validateAnswer(block, answersRef.current[block.id]);
        if (!check.ok) {
          setError(check.error);
          setErrorBlockId(block.id);
          return;
        }
      }
    }
    if (index >= lastQuestionIndex) {
      void submit();
      return;
    }
    goTo(index + 1);
  }, [goTo, index, lastQuestionIndex, preview, step, submit]);

  const setAnswer = (blockId: string, value: AnswerValue) => {
    answersRef.current = { ...answersRef.current, [blockId]: value };
    setAnswers(answersRef.current);
    setError(null);
    setErrorBlockId(null);
  };

  // Teclado: Enter avanza; flechas arriba/abajo (fuera de un campo) navegan.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT");
      if (e.key === "Enter" && !e.shiftKey && target?.tagName !== "TEXTAREA" && step.kind !== "end") {
        e.preventDefault();
        if (step.kind === "welcome") goTo(index + 1);
        else next();
      } else if (!typing && e.key === "ArrowDown" && step.kind !== "end") next();
      else if (!typing && e.key === "ArrowUp" && step.kind !== "end") goTo(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index, next, step.kind]);

  // El mapa de la pantalla siguiente (o de la confirmación) se precarga desde la anterior.
  const nextStep = steps[index + 1];
  const nextMapBlock = nextStep?.kind === "block" ? nextStep.items.find((i) => i.block.type === "map")?.block : undefined;
  const upcomingMap = nextMapBlock
    ? nextMapBlock.config.mapResolved || nextMapBlock.config.mapQuery || ""
    : nextStep?.kind === "end"
      ? settings.endMapResolved || settings.endMapQuery || ""
      : "";

  const motion = visible ? "opacity-100 translate-y-0 blur-0" : `opacity-0 blur-[2px] ${direction === 1 ? "-translate-y-6" : "translate-y-6"}`;

  return (
    <div className={`relative min-h-[100dvh] overflow-hidden ${theme.page}`}>
      {/* Fondo: un resplandor suave arriba, en el azul de la marca. */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-gradient-to-b ${theme.glow}`} aria-hidden />
      {settings.particles ? <FormParticles dark={dark} /> : null}
      {upcomingMap ? <MapPreload key={upcomingMap} query={upcomingMap} /> : null}
      <div className="fixed inset-x-0 top-0 z-30 h-1 bg-black/5">
        <div className={`h-full ${theme.bar} transition-[width] duration-700 ease-out`} style={{ width: `${progress}%` }} />
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-10">
        {/* Con logo propio, en la bienvenida el logo va grande al centro y arriba queda el
            título; desde la primera pregunta el título se va y el logo pasa a esta esquina. */}
        <div className="flex min-h-16 items-center transition-opacity ease-out sm:min-h-20" style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}>
          {customLogo && step.kind === "welcome" ? (
            <p className="max-w-[70vw] px-3 text-base font-semibold tracking-tight sm:text-xl">{settings.welcomeTitle || title}</p>
          ) : (
            <span className={`inline-flex items-center rounded-lg px-3 py-2 ${dark && !customLogo ? "bg-white" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={headerLogo} alt={customLogo ? title : "Soundtec"} className={customLogo ? "h-12 w-auto max-w-[240px] object-contain sm:h-16 sm:max-w-[340px]" : "h-11 w-auto sm:h-14"} />
            </span>
          )}
        </div>
        {preview ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Vista previa: no se envía ni pide obligatorios</span> : null}
      </header>

      {/* Campo trampa para bots: invisible para personas. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden value={hp} onChange={(e) => setHp(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />

      <main className="relative z-10 flex min-h-[calc(100dvh-5rem)] items-center px-5 pb-24 pt-6 sm:px-10">
        <div className={`mx-auto w-full max-w-5xl transition-all ease-out ${motion}`} style={{ transitionDuration: `${FADE_MS}ms` }}>
          {step.kind === "welcome" ? (
            <Screen
              heroLogo={customLogo ? headerLogo : undefined}
              heroLogoOnDark={false}
              title={customLogo ? "" : settings.welcomeTitle || title}
              body={settings.welcomeBody}
              proseClass={theme.prose}
              mutedClass={theme.muted}
              big
            >
              <PrimaryButton className={theme.button} onClick={() => goTo(index + 1)}>
                {settings.welcomeButton || "Comenzar"} <ArrowRight className="h-5 w-5" />
              </PrimaryButton>
              <p className={`mt-3 text-sm ${theme.muted}`}>o presioná <b>Enter ↵</b></p>
            </Screen>
          ) : null}

          {step.kind === "end" ? (
            <EndScreen
              settings={settings}
              theme={theme}
              alreadyDone={alreadyDone && !restarted}
              onRestart={
                alreadyDone && !restarted && !preview && canRestart
                  ? () => {
                      setRestarted(true);
                      goTo(0);
                    }
                  : undefined
              }
            />
          ) : null}

          {step.kind === "block" && step.items.length === 1 ? (
            <BlockScreen
              key={step.items[0].block.id}
              block={step.items[0].block}
              number={step.items[0].number}
              value={answers[step.items[0].block.id] ?? null}
              onChange={(v) => setAnswer(step.items[0].block.id, v)}
              onNext={next}
              error={error}
              theme={theme}
              isLast={index >= lastQuestionIndex}
              sending={sending}
            />
          ) : null}

          {step.kind === "block" && step.items.length > 1 ? (
            <GroupScreen
              key={step.items[0].block.id}
              items={step.items}
              answers={answers}
              onChange={setAnswer}
              onNext={next}
              error={error}
              errorBlockId={errorBlockId}
              theme={theme}
              isLast={index >= lastQuestionIndex}
              sending={sending}
            />
          ) : null}
        </div>
      </main>

      {step.kind === "block" ? (
        <nav className="fixed bottom-5 right-5 z-30 flex overflow-hidden rounded-lg shadow-lg" aria-label="Navegación">
          <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Pantalla anterior" className={`flex h-11 w-11 items-center justify-center disabled:opacity-40 ${theme.button}`}>
            <ChevronUp className="h-5 w-5" />
          </button>
          <span className="w-px bg-white/30" />
          <button type="button" onClick={next} aria-label="Pantalla siguiente" className={`flex h-11 w-11 items-center justify-center ${theme.button}`}>
            <ChevronDown className="h-5 w-5" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Pantalla de cierre / confirmación. Con datos útiles, mapa o programa pasa a ser
 * una ficha del evento; es lo que ve quien ya respondió cuando vuelve al enlace.
 */
function EndScreen({ settings, theme, alreadyDone, onRestart }: { settings: FormSettings; theme: FormTheme; alreadyDone: boolean; onRestart?: () => void }) {
  const info = (settings.endInfo ?? []).filter((i) => i.label.trim() || i.value.trim());
  const agenda = (settings.endAgenda ?? []).filter((i) => i.time.trim() || i.title.trim());
  const mapQuery = settings.endMapResolved || settings.endMapQuery || "";
  const hasExtras = info.length > 0 || agenda.length > 0 || Boolean(mapQuery);
  const header = (
    <>
      <span className={`inline-flex h-14 w-14 items-center justify-center rounded-full ${theme.bar} text-white shadow-lg`}>
        <Check className="h-7 w-7" />
      </span>
      {alreadyDone ? <p className={`mt-5 text-sm font-semibold uppercase tracking-[0.14em] ${theme.muted}`}>Ya recibimos tus respuestas</p> : null}
      <h1 className={`${alreadyDone ? "mt-2" : "mt-5"} text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl`}>{settings.endTitle || "¡Gracias!"}</h1>
      <RichBody html={settings.endBody} className={`mt-5 ${theme.prose} ${theme.muted}`} />
    </>
  );
  const restart = onRestart ? (
    <button type="button" onClick={onRestart} className={`mt-8 text-sm underline underline-offset-4 ${theme.muted}`}>
      ¿No sos vos o querés cambiar algo? Completar de nuevo
    </button>
  ) : null;

  if (!hasExtras) {
    return (
      <div className={`grid items-center gap-10 ${settings.endImageUrl ? "lg:grid-cols-2" : ""}`}>
        <div className={settings.endImageUrl ? "" : "mx-auto max-w-3xl text-center"}>
          {header}
          {restart}
        </div>
        {settings.endImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.endImageUrl} alt="" className="max-h-[65vh] w-full rounded-2xl object-cover shadow-2xl" />
        ) : null}
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-3xl">{header}</div>
      <div className={`mt-12 grid gap-12 ${mapQuery && (info.length || agenda.length) ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}`}>
        {info.length || agenda.length ? (
          <div className="space-y-12">
            {info.length ? (
              <section>
                <h2 className="mb-5 text-xl font-semibold">Información útil</h2>
                <InfoList items={info} theme={theme} />
              </section>
            ) : null}
            {agenda.length ? (
              <section>
                <h2 className="mb-5 text-xl font-semibold">Programa</h2>
                <AgendaList items={agenda} theme={theme} />
              </section>
            ) : null}
          </div>
        ) : null}
        {mapQuery ? (
          <section>
            <h2 className="mb-5 text-xl font-semibold">Cómo llegar</h2>
            <MapPanel query={mapQuery} openUrl={/^https?:\/\//i.test(settings.endMapQuery ?? "") ? settings.endMapQuery : null} theme={theme} />
          </section>
        ) : null}
      </div>
      {restart}
    </div>
  );
}

/** Campos que se completan solos con los datos del invitado: email, nombre y empresa (por el título de la pregunta). */
function prefillFromInvite(blocks: PublicBlock[], invite?: { email: string; name: string; company: string }): Record<string, AnswerValue> {
  if (!invite) return {};
  const values: Record<string, AnswerValue> = {};
  for (const block of blocks) {
    if (block.type === "email" && invite.email) values[block.id] = invite.email;
    else if (block.type === "short_text" && invite.name && /nombre|apellido/i.test(block.title)) values[block.id] = invite.name;
    else if (block.type === "short_text" && invite.company && /empresa|compa[nñ][ií]a|estudio/i.test(block.title)) values[block.id] = invite.company;
  }
  return values;
}

function PrimaryButton({ children, onClick, className, disabled }: { children: React.ReactNode; onClick: () => void; className: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-8 inline-flex h-14 items-center gap-2 rounded-xl px-7 text-lg font-semibold shadow-lg transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function RichBody({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return (
    <div
      className={`form-rich prose max-w-none text-lg leading-relaxed sm:text-xl [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Screen({
  title,
  body,
  imageUrl,
  children,
  proseClass,
  mutedClass,
  big,
  heroLogo,
  heroLogoOnDark,
}: {
  /** Logo propio del formulario, grande y centrado arriba del título. */
  heroLogo?: string;
  heroLogoOnDark?: boolean;
  title: string;
  body?: string;
  imageUrl?: string;
  children?: React.ReactNode;
  proseClass: string;
  mutedClass: string;
  big?: boolean;
}) {
  return (
    <div className={`grid items-center gap-10 ${imageUrl ? "lg:grid-cols-2" : ""}`}>
      <div className={imageUrl ? "" : "mx-auto max-w-3xl text-center"}>
        {heroLogo ? (
          <div className={`mb-8 flex ${imageUrl ? "" : "justify-center"}`}>
            <span className={`inline-flex rounded-2xl ${heroLogoOnDark ? "bg-white px-6 py-4" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroLogo} alt={title || "Logo"} className="max-h-40 w-auto max-w-[min(560px,85vw)] object-contain" />
            </span>
          </div>
        ) : null}
        {title ? <h1 className={`font-semibold leading-[1.1] tracking-tight ${big ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"}`}>{title}</h1> : null}
        <RichBody html={body} className={`mt-6 ${proseClass} ${mutedClass}`} />
        {children}
      </div>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="max-h-[65vh] w-full rounded-2xl object-cover shadow-2xl" />
      ) : null}
    </div>
  );
}

function BlockScreen({
  block,
  number,
  value,
  onChange,
  onNext,
  error,
  theme,
  isLast,
  sending,
}: {
  block: PublicBlock;
  number: number | null;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  onNext: () => void;
  error: string | null;
  theme: FormTheme;
  isLast: boolean;
  sending: boolean;
}) {
  const c = block.config;
  const isQuestion = isQuestionType(block.type);
  const button = <NextButton onNext={onNext} sending={sending} isLast={isLast} label={c.buttonLabel || (isQuestion ? "OK" : "Continuar")} theme={theme} multiline={block.type === "long_text"} />;
  const errorBox = error ? (
    <p role="alert" className="mt-4 inline-flex animate-[shake_.35s] rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">
      {error}
    </p>
  ) : null;

  // Diapositiva de imagen: la imagen manda, a pantalla casi completa.
  if (block.type === "image") {
    return (
      <div className="text-center">
        {block.title ? <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl">{block.title}</h2> : null}
        {c.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.mediaUrl} alt={c.mediaAlt || block.title} className="mx-auto max-h-[68vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl" />
        ) : null}
        <RichBody html={block.body} className={`mx-auto mt-6 max-w-3xl ${theme.prose} ${theme.muted}`} />
        <div className="flex justify-center">{button}</div>
      </div>
    );
  }

  if (block.type === "video") {
    const embed = videoEmbedUrl(c.videoUrl);
    return (
      <div className="text-center">
        {block.title ? <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl">{block.title}</h2> : null}
        <div className="mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl">
          {embed ? (
            <iframe src={embed} title={block.title || "Video"} referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : c.mediaUrl ? (
            <video src={c.mediaUrl} controls playsInline className="h-full w-full" />
          ) : null}
        </div>
        <RichBody html={block.body} className={`mx-auto mt-6 max-w-3xl ${theme.prose} ${theme.muted}`} />
        <div className="flex justify-center">{button}</div>
      </div>
    );
  }

  if (block.type === "map") {
    return (
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{block.title}</h2>
          <RichBody html={block.body} className={`mt-5 ${theme.prose} ${theme.muted}`} />
          {button}
        </div>
        <MapPanel query={c.mapResolved || c.mapQuery || ""} openUrl={mapOpenUrl(block)} theme={theme} tall directions={false} />
      </div>
    );
  }

  if (block.type === "agenda") {
    return (
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{block.title}</h2>
        <RichBody html={block.body} className={`mt-4 ${theme.prose} ${theme.muted}`} />
        <div className="mt-8">
          <AgendaList items={c.agenda ?? []} theme={theme} />
        </div>
        {button}
      </div>
    );
  }

  const side = c.sideImageUrl;
  const content = (
    <div>
      {number != null ? (
        <p className={`mb-3 flex items-center gap-2 text-base font-semibold ${theme.muted}`}>
          <span>{number}</span>
          <ArrowRight className="h-4 w-4" />
        </p>
      ) : null}
      <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem]">
        {block.title}
        {block.required && isQuestion ? <span className={`ml-1 ${theme.mark}`}>*</span> : null}
      </h2>
      <RichBody html={block.body} className={`mt-4 ${theme.prose} ${theme.muted}`} />
      {isQuestion ? <div className="mt-8"><QuestionInput block={block} value={value} onChange={onChange} onNext={onNext} theme={theme} /></div> : null}
      {errorBox}
      {button}
    </div>
  );
  // Marcas: área más ancha (6 columnas en escritorio) para que entren todas sin scroll.
  if (!side) return <div className={`mx-auto ${block.type === "brand_choice" ? "max-w-6xl" : "max-w-3xl"}`}>{content}</div>;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      {content}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={side} alt="" className="max-h-[65vh] w-full rounded-2xl object-cover shadow-2xl" />
    </div>
  );
}

function NextButton({
  onNext,
  sending,
  isLast,
  label,
  theme,
  multiline,
}: {
  onNext: () => void;
  sending: boolean;
  isLast: boolean;
  label: string;
  theme: FormTheme;
  multiline?: boolean;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={onNext}
        disabled={sending}
        className={`inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-semibold shadow-md transition hover:-translate-y-0.5 disabled:opacity-60 ${theme.button}`}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : isLast ? null : <Check className="h-4 w-4" />}
        {sending ? "Enviando…" : isLast ? "Enviar" : label}
      </button>
      {multiline ? (
        <span className={`hidden text-sm sm:inline ${theme.muted}`}>
          <b>Shift + Enter</b> para un salto de línea
        </span>
      ) : (
        <span className={`hidden text-sm sm:inline ${theme.muted}`}>
          o presioná <b>Enter ↵</b>
        </span>
      )}
    </div>
  );
}

/**
 * Pantalla con varios campos juntos (p. ej. nombre, empresa, mail y celular).
 * Si arranca con una pantalla de texto, esa hace de encabezado.
 */
function GroupScreen({
  items,
  answers,
  onChange,
  onNext,
  error,
  errorBlockId,
  theme,
  isLast,
  sending,
}: {
  items: StepItem[];
  answers: Record<string, AnswerValue>;
  onChange: (blockId: string, value: AnswerValue) => void;
  onNext: () => void;
  error: string | null;
  errorBlockId: string | null;
  theme: FormTheme;
  isLast: boolean;
  sending: boolean;
}) {
  const head = !isQuestionType(items[0].block.type) ? items[0].block : null;
  const fields = head ? items.slice(1) : items;
  const firstQuestion = fields.find((f) => isQuestionType(f.block.type))?.block.id;
  const looseError = error && !fields.some((f) => f.block.id === errorBlockId) ? error : null;
  const lastField = fields[fields.length - 1]?.block;
  return (
    <div className="mx-auto max-w-3xl">
      {head ? (
        <>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[2.4rem]">{head.title}</h2>
          <RichBody html={head.body} className={`mt-3 ${theme.prose} ${theme.muted}`} />
        </>
      ) : null}
      <div className={`${head ? "mt-8" : ""} space-y-7`}>
        {fields.map(({ block }) =>
          isQuestionType(block.type) ? (
            <div key={block.id}>
              <label className="block text-lg font-semibold leading-snug sm:text-xl">
                {block.title}
                {block.required ? <span className={`ml-1 ${theme.mark}`}>*</span> : null}
              </label>
              <RichBody html={block.body} className={`mt-1 !text-base ${theme.prose} ${theme.muted}`} />
              <div className="mt-3">
                <QuestionInput block={block} value={answers[block.id] ?? null} onChange={(v) => onChange(block.id, v)} onNext={onNext} theme={theme} grouped focus={block.id === firstQuestion} />
              </div>
              {error && errorBlockId === block.id ? <ErrorNote message={error} /> : null}
            </div>
          ) : (
            <div key={block.id}>
              {block.title ? <p className="text-lg font-semibold">{block.title}</p> : null}
              <RichBody html={block.body} className={`!text-base ${theme.prose} ${theme.muted}`} />
            </div>
          )
        )}
      </div>
      {looseError ? <ErrorNote message={looseError} /> : null}
      <NextButton onNext={onNext} sending={sending} isLast={isLast} label={lastField?.config.buttonLabel || "Continuar"} theme={theme} />
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-3 inline-flex animate-[shake_.35s] rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">
      {message}
    </p>
  );
}

/** Grilla de logos de marcas para tildar (varias). Sin logo, se muestra el nombre. */
function BrandGrid({ options, logos, selected, onToggle, theme }: { options: string[]; logos: Record<string, string>; selected: string[]; onToggle: (name: string) => void; theme: FormTheme }) {
  // Logos que no cargan: se muestra el nombre de la marca en lugar de la imagen rota.
  const [broken, setBroken] = useState<string[]>([]);
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {options.map((name) => {
        const on = selected.includes(name);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(name)}
            className={`relative flex h-20 items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-3 text-neutral-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${on ? theme.tileOn : ""}`}
          >
            {logos[name] && !broken.includes(name) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logos[name]}
                alt={name}
                onError={() => setBroken((prev) => [...prev, name])}
                className={`max-h-10 max-w-full object-contain transition ${on ? "" : "opacity-80 grayscale"}`}
              />
            ) : (
              <span className="text-base font-semibold">{name}</span>
            )}
            {on ? (
              <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-950 text-white">
                <Check className="h-4 w-4" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function QuestionInput({
  block,
  value,
  onChange,
  onNext,
  theme,
  grouped = false,
  focus = true,
}: {
  block: PublicBlock;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  onNext: () => void;
  theme: FormTheme;
  /** Dentro de una pantalla con varios campos: letra más chica y sin avanzar solo al elegir. */
  grouped?: boolean;
  focus?: boolean;
}) {
  const c = block.config;
  const autoFocus = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (focus && el && window.matchMedia("(min-width: 768px)").matches) window.setTimeout(() => el.focus({ preventScroll: true }), 80);
    },
    [focus]
  );
  const lineInput = `w-full border-0 border-b-2 bg-transparent pb-2 outline-none transition ${grouped ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"} ${theme.input}`;
  const advance = () => {
    if (!grouped) window.setTimeout(onNext, 380);
  };

  const choose = (option: string) => {
    if (block.type === "multi_choice" || block.type === "brand_choice") {
      const list = Array.isArray(value) ? value : [];
      onChange(list.includes(option) ? list.filter((o) => o !== option) : [...list, option]);
    } else {
      onChange(option);
      advance();
    }
  };

  // Atajos de letra para elegir opciones (A, B, C…).
  const onChoiceKey = (e: ReactKeyboardEvent<HTMLDivElement>, options: string[]) => {
    const i = LETTERS.indexOf(e.key.toUpperCase());
    if (e.key.length === 1 && i >= 0 && i < options.length && !(e.target as HTMLElement).closest("input")) {
      e.preventDefault();
      choose(options[i]);
    }
  };

  switch (block.type) {
    case "long_text":
      return (
        <textarea
          ref={autoFocus}
          rows={3}
          value={typeof value === "string" ? value : ""}
          placeholder={c.placeholder || "Escribí tu respuesta…"}
          maxLength={c.maxLength ?? 5000}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onNext();
            }
          }}
          className={`${lineInput} resize-none`}
        />
      );
    case "short_text":
    case "email":
    case "phone":
    case "number":
    case "date":
      return (
        <input
          ref={autoFocus}
          type={block.type === "email" ? "email" : block.type === "phone" ? "tel" : block.type === "number" ? "number" : block.type === "date" ? "date" : "text"}
          inputMode={block.type === "number" ? "decimal" : block.type === "phone" ? "tel" : undefined}
          autoComplete={block.type === "email" ? "email" : block.type === "phone" ? "tel" : "off"}
          value={value == null ? "" : String(value)}
          placeholder={c.placeholder || (block.type === "email" ? "nombre@empresa.com" : block.type === "phone" ? "+54 9 11 …" : "Escribí tu respuesta…")}
          min={c.min}
          max={c.max}
          onChange={(e) => onChange(e.target.value)}
          className={lineInput}
        />
      );
    case "single_choice":
    case "multi_choice":
    case "yes_no": {
      const options = block.type === "yes_no" ? ["Sí", "No"] : c.options ?? [];
      const selected = Array.isArray(value) ? value : value == null ? [] : [String(value)];
      const otherValue = selected.find((v) => v.startsWith(OTHER_PREFIX));
      return (
        <div tabIndex={0} onKeyDown={(e) => onChoiceKey(e, options)} className="flex max-w-xl flex-col gap-2.5 outline-none">
          {block.type === "multi_choice" ? <p className={`-mt-4 mb-1 text-sm ${theme.muted}`}>Podés elegir varias.</p> : null}
          {options.map((option, i) => {
            const on = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                className={`group flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg font-medium transition ${on ? theme.choiceOn : theme.choice}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${theme.key}`}>{LETTERS[i]}</span>
                <span className="flex-1">{option}</span>
                {on ? <Check className="h-5 w-5" /> : null}
              </button>
            );
          })}
          {c.allowOther && block.type !== "yes_no" ? (
            <input
              value={otherValue ? otherValue.slice(OTHER_PREFIX.length) : ""}
              placeholder="Otra (escribila)"
              onChange={(e) => {
                const text = e.target.value;
                const rest = selected.filter((v) => !v.startsWith(OTHER_PREFIX));
                const other = text.trim() ? [`${OTHER_PREFIX}${text}`] : [];
                onChange(block.type === "multi_choice" ? [...rest, ...other] : other[0] ?? null);
              }}
              className={`mt-1 rounded-xl border-2 bg-transparent px-4 py-3 text-lg outline-none ${theme.choice}`}
            />
          ) : null}
        </div>
      );
    }
    case "dropdown":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={`w-full max-w-xl rounded-xl border-2 bg-transparent px-4 py-3 text-xl outline-none ${theme.choice}`}
        >
          <option value="">Elegí una opción…</option>
          {(c.options ?? []).map((o) => (
            <option key={o} value={o} className="text-black">
              {o}
            </option>
          ))}
        </select>
      );
    case "scale": {
      const min = c.min ?? 1;
      const max = c.max ?? 10;
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className="max-w-3xl">
          <div className="flex flex-wrap gap-2">
            {values.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  onChange(n);
                  advance();
                }}
                className={`h-14 min-w-[3.5rem] flex-1 rounded-xl border-2 text-xl font-semibold transition ${value === n ? theme.choiceOn : theme.choice}`}
              >
                {n}
              </button>
            ))}
          </div>
          {c.minLabel || c.maxLabel ? (
            <div className={`mt-2 flex justify-between text-sm ${theme.muted}`}>
              <span>{c.minLabel}</span>
              <span>{c.maxLabel}</span>
            </div>
          ) : null}
        </div>
      );
    }
    case "brand_choice": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div>
          <p className={`-mt-2 mb-3 text-sm ${theme.muted}`}>Tocá las que quieras.</p>
          <BrandGrid options={c.options ?? []} logos={c.brandLogos ?? {}} selected={selected} onToggle={choose} theme={theme} />
        </div>
      );
    }
    case "consent":
      return (
        <button
          type="button"
          onClick={() => onChange(value === true ? null : true)}
          className={`flex max-w-xl items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg font-medium transition ${value === true ? theme.choiceOn : theme.choice}`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${theme.key}`}>{value === true ? <Check className="h-4 w-4" /> : null}</span>
          Acepto
        </button>
      );
    default:
      return null;
  }
}
