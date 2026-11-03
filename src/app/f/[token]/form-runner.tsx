"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowRight, Check, ChevronDown, ChevronUp, ExternalLink, Loader2, MapPin } from "lucide-react";
import { submitFormResponse } from "@/server/actions/form-submit";
import {
  OTHER_PREFIX,
  isQuestionType,
  mapEmbedUrl,
  mapOpenUrl,
  validateAnswer,
  videoEmbedUrl,
  type AnswerValue,
  type FormSettings,
  type PublicBlock,
} from "@/lib/forms/types";

type Step = { kind: "welcome" } | { kind: "block"; block: PublicBlock; number: number | null } | { kind: "end" };

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
}: {
  token: string;
  title: string;
  logoUrl: string;
  settings: FormSettings;
  blocks: PublicBlock[];
  /** Vista previa del panel: no envía. */
  preview?: boolean;
}) {
  const dark = settings.theme === "dark";
  const steps = useMemo<Step[]>(() => {
    let n = 0;
    const list: Step[] = [];
    if (settings.welcomeTitle || settings.welcomeBody || settings.welcomeImageUrl) list.push({ kind: "welcome" });
    for (const block of blocks) list.push({ kind: "block", block, number: isQuestionType(block.type) ? ++n : null });
    list.push({ kind: "end" });
    return list;
  }, [blocks, settings.welcomeTitle, settings.welcomeBody, settings.welcomeImageUrl]);

  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  // Copia sincrónica: al elegir una opción se avanza enseguida y el estado todavía no se actualizó.
  const answersRef = useRef<Record<string, AnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
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
    const result = await submitFormResponse({ token, answers: answersRef.current, hp });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      const target = result.blockId ? steps.findIndex((s) => s.kind === "block" && s.block.id === result.blockId) : -1;
      if (target >= 0 && target !== index) goTo(target);
      return;
    }
    goTo(steps.length - 1);
  }, [goTo, hp, index, preview, steps, token]);

  const next = useCallback(() => {
    if (step.kind === "block" && isQuestionType(step.block.type)) {
      const check = validateAnswer(step.block, answersRef.current[step.block.id]);
      if (!check.ok) {
        setError(check.error);
        return;
      }
    }
    if (index >= lastQuestionIndex) {
      void submit();
      return;
    }
    goTo(index + 1);
  }, [goTo, index, lastQuestionIndex, step, submit]);

  const setAnswer = (blockId: string, value: AnswerValue) => {
    answersRef.current = { ...answersRef.current, [blockId]: value };
    setAnswers(answersRef.current);
    setError(null);
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

  const theme = dark
    ? {
        page: "bg-[#13233a] text-white",
        glow: "from-[#2f5f9e]/45 via-transparent to-transparent",
        muted: "text-white/70",
        input: "border-white/40 text-white placeholder:text-white/35 focus:border-white",
        choice: "border-white/25 bg-white/5 hover:bg-white/10",
        choiceOn: "border-white bg-white/20",
        key: "border-white/40 text-white/80",
        button: "bg-white text-[#13233a] hover:bg-white/90",
        prose: "prose-invert",
      }
    : {
        page: "bg-white text-[#13233a]",
        glow: "from-[#dbe7f7] via-transparent to-transparent",
        muted: "text-[#13233a]/65",
        input: "border-[#13233a]/30 text-[#13233a] placeholder:text-[#13233a]/30 focus:border-[#1e3553]",
        choice: "border-[#1e3553]/20 bg-[#1e3553]/[0.03] hover:bg-[#1e3553]/[0.08]",
        choiceOn: "border-[#1e3553] bg-[#1e3553]/10",
        key: "border-[#1e3553]/35 text-[#1e3553]",
        button: "bg-[#1e3553] text-white hover:bg-[#16283f]",
        prose: "",
      };

  const motion = visible ? "opacity-100 translate-y-0 blur-0" : `opacity-0 blur-[2px] ${direction === 1 ? "-translate-y-6" : "translate-y-6"}`;

  return (
    <div className={`relative min-h-[100dvh] overflow-hidden ${theme.page}`}>
      {/* Fondo: un resplandor suave arriba, en el azul de la marca. */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-gradient-to-b ${theme.glow}`} aria-hidden />
      <div className="fixed inset-x-0 top-0 z-30 h-1 bg-black/5">
        <div className="h-full bg-[#2f6fd6] transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-10">
        <span className={`inline-flex items-center rounded-lg px-3 py-2 ${dark ? "bg-white" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Soundtec" className="h-11 w-auto sm:h-14" />
        </span>
        {preview ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Vista previa: no se envía</span> : null}
      </header>

      {/* Campo trampa para bots: invisible para personas. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden value={hp} onChange={(e) => setHp(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />

      <main className="relative z-10 flex min-h-[calc(100dvh-5rem)] items-center px-5 pb-24 pt-6 sm:px-10">
        <div className={`mx-auto w-full max-w-5xl transition-all ease-out ${motion}`} style={{ transitionDuration: `${FADE_MS}ms` }}>
          {step.kind === "welcome" ? (
            <Screen
              title={settings.welcomeTitle || title}
              body={settings.welcomeBody}
              imageUrl={settings.welcomeImageUrl}
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
            <Screen title={settings.endTitle || "¡Gracias!"} body={settings.endBody} imageUrl={settings.endImageUrl} proseClass={theme.prose} mutedClass={theme.muted} big>
              <span className="mt-2 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#2f6fd6] text-white shadow-lg">
                <Check className="h-7 w-7" />
              </span>
            </Screen>
          ) : null}

          {step.kind === "block" ? (
            <BlockScreen
              key={step.block.id}
              block={step.block}
              number={step.number}
              value={answers[step.block.id] ?? null}
              onChange={(v) => setAnswer(step.block.id, v)}
              onNext={next}
              error={error}
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
}: {
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
        <h1 className={`font-semibold leading-[1.1] tracking-tight ${big ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"}`}>{title}</h1>
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

type Theme = { muted: string; input: string; choice: string; choiceOn: string; key: string; button: string; prose: string };

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
  theme: Theme;
  isLast: boolean;
  sending: boolean;
}) {
  const c = block.config;
  const isQuestion = isQuestionType(block.type);
  const buttonText = sending ? "Enviando…" : isLast ? "Enviar" : c.buttonLabel || (isQuestion ? "OK" : "Continuar");
  const button = (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={onNext}
        disabled={sending}
        className={`inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-semibold shadow-md transition hover:-translate-y-0.5 disabled:opacity-60 ${theme.button}`}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : isLast ? null : <Check className="h-4 w-4" />}
        {buttonText}
      </button>
      {block.type !== "long_text" ? <span className={`hidden text-sm sm:inline ${theme.muted}`}>o presioná <b>Enter ↵</b></span> : <span className={`hidden text-sm sm:inline ${theme.muted}`}><b>Shift + Enter</b> para un salto de línea</span>}
    </div>
  );
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
    const embed = mapEmbedUrl(c.mapQuery);
    const open = mapOpenUrl(block);
    return (
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{block.title}</h2>
          <RichBody html={block.body} className={`mt-5 ${theme.prose} ${theme.muted}`} />
          {open ? (
            <a href={open} target="_blank" rel="noopener noreferrer" className={`mt-6 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 font-semibold ${theme.choice}`}>
              <MapPin className="h-4 w-4" /> Abrir en Google Maps <ExternalLink className="h-4 w-4 opacity-60" />
            </a>
          ) : null}
          {button}
        </div>
        {embed ? (
          <iframe src={embed} title="Mapa" loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-[50vh] min-h-[320px] w-full rounded-2xl border-0 shadow-2xl" />
        ) : null}
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
        {block.required && isQuestion ? <span className="ml-1 text-[#2f6fd6]">*</span> : null}
      </h2>
      <RichBody html={block.body} className={`mt-4 ${theme.prose} ${theme.muted}`} />
      {isQuestion ? <div className="mt-8"><QuestionInput block={block} value={value} onChange={onChange} onNext={onNext} theme={theme} /></div> : null}
      {errorBox}
      {button}
    </div>
  );
  if (!side) return <div className="mx-auto max-w-3xl">{content}</div>;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      {content}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={side} alt="" className="max-h-[65vh] w-full rounded-2xl object-cover shadow-2xl" />
    </div>
  );
}

function QuestionInput({
  block,
  value,
  onChange,
  onNext,
  theme,
}: {
  block: PublicBlock;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  onNext: () => void;
  theme: Theme;
}) {
  const c = block.config;
  const autoFocus = useCallback((el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el && window.matchMedia("(min-width: 768px)").matches) window.setTimeout(() => el.focus({ preventScroll: true }), 80);
  }, []);
  const lineInput = `w-full border-0 border-b-2 bg-transparent pb-2 text-2xl outline-none transition sm:text-3xl ${theme.input}`;

  const choose = (option: string) => {
    if (block.type === "multi_choice") {
      const list = Array.isArray(value) ? value : [];
      onChange(list.includes(option) ? list.filter((o) => o !== option) : [...list, option]);
    } else {
      onChange(option);
      window.setTimeout(onNext, 380);
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
                  window.setTimeout(onNext, 380);
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
