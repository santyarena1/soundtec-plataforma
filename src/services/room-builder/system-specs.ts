/**
 * Especificaciones de sistema leídas del nombre del producto (y del perfil
 * de IA cuando lo hay). Son el punto de partida: lo cargado a mano en
 * Admin → Reglas del Room Builder siempre gana.
 */

export type SpecKind = "amplifier" | "speaker" | "streamer" | "processor" | "display" | "switch" | "other";

export type SystemSpec = {
  kind: SpecKind;
  channels: number | null;
  wattsPerChannel: number | null;
  minOhms: number | null;
  nominalOhms: number | null;
  highImpedance: boolean;
  streaming: boolean;
  networked: boolean;
  source: "auto" | "manual";
};

export type SpecInput = {
  name: string;
  brandSlug: string | null;
  designRole: string | null;
  ai?: { productType?: string | null; powerWatts?: number | null; impedanceOhms?: number | null; audioLine?: string | null } | null;
};

const EMPTY: Omit<SystemSpec, "kind"> = {
  channels: null,
  wattsPerChannel: null,
  minOhms: null,
  nominalOhms: null,
  highImpedance: false,
  streaming: false,
  networked: false,
  source: "auto",
};

const AMP_NAME = /amplif|\bamp\b|amp-|powerzone|sonamp|\bdsp \d+-\d+/i;
const STREAMER_NAME = /\bnode\b|bluos|streamer|sonos|dm-nax/i;
const SWITCH_NAME = /\bswitch\b|poe\+? switch|cen-sw/i;

/** Blaze PowerZone: "254" = 4 canales de 250 W; "122" = 2 de 125 W. PRO "600.4" = 600 W totales en 4 canales. */
function parseBlaze(name: string): Pick<SystemSpec, "channels" | "wattsPerChannel"> | null {
  const pro = name.match(/\b(\d{3,4})\.(\d)\b/);
  if (pro && /pro/i.test(name)) {
    const ch = Number(pro[2]);
    return { channels: ch, wattsPerChannel: Math.round(Number(pro[1]) / ch) };
  }
  const m = name.match(/powerzone(?: connect)?\s+(\d{2,3})(\d)d?\b/i);
  if (!m) return null;
  const lead = Number(m[1]);
  const watts = lead === 12 ? 125 : lead === 17 ? 175 : lead * 10;
  return { channels: Number(m[2]), wattsPerChannel: watts };
}

/** "SONAMP 2-100", "DSP 8-130", "UA 2-125": canales-watts. */
function parseChannelsDashWatts(name: string): Pick<SystemSpec, "channels" | "wattsPerChannel"> | null {
  const m = name.match(/\b(\d{1,2})-(\d{2,4})\b/);
  if (!m) return null;
  const ch = Number(m[1]);
  return ch >= 1 && ch <= 16 ? { channels: ch, wattsPerChannel: Number(m[2]) } : null;
}

/** Crestron "AMP-8150" = 8 canales de 150 W. */
function parseCrestronAmp(name: string): Pick<SystemSpec, "channels" | "wattsPerChannel"> | null {
  const m = name.match(/\bAMPI?-(\d)(\d{2,3})\b/i);
  return m ? { channels: Number(m[1]), wattsPerChannel: Number(m[2]) } : null;
}

/** "4x100W", "2 x 50 W". */
function parseTimesWatts(name: string): Pick<SystemSpec, "channels" | "wattsPerChannel"> | null {
  const m = name.match(/\b(\d{1,2})\s*x\s*(\d{2,4})\s*w\b/i);
  return m ? { channels: Number(m[1]), wattsPerChannel: Number(m[2]) } : null;
}

function kindFor(input: SpecInput): SpecKind {
  const type = input.ai?.productType ?? "";
  if (type === "amplifier" || AMP_NAME.test(input.name)) return "amplifier";
  if (STREAMER_NAME.test(input.name)) return "streamer";
  if (SWITCH_NAME.test(input.name)) return "switch";
  if (type === "speaker" || type === "subwoofer" || input.designRole === "speaker") return "speaker";
  if (input.designRole === "display") return "display";
  if (input.designRole === "processor" || input.designRole === "codec") return "processor";
  return "other";
}

/** Especificación deducida (source "auto"). */
export function deriveSystemSpec(input: SpecInput): SystemSpec {
  const kind = kindFor(input);
  const highImpedance = input.ai?.audioLine === "70V" || input.ai?.audioLine === "100V" || /\b(70|100)\s?v\b/i.test(input.name);
  const base: SystemSpec = { ...EMPTY, kind, highImpedance };

  if (kind === "amplifier") {
    const parsed =
      (input.brandSlug?.includes("blaze") || /powerzone/i.test(input.name) ? parseBlaze(input.name) : null) ??
      (input.brandSlug === "crestron" ? parseCrestronAmp(input.name) : null) ??
      parseTimesWatts(input.name) ??
      parseChannelsDashWatts(input.name);
    return {
      ...base,
      channels: parsed?.channels ?? null,
      wattsPerChannel: parsed?.wattsPerChannel ?? (input.ai?.powerWatts ? Math.round(input.ai.powerWatts) : null),
      // Los amplificadores multizona actuales admiten 4 Ω salvo que se indique otra cosa.
      minOhms: parsed ? 4 : null,
      networked: /connect|dm-nax|dsp|\bip\b|pro\b/i.test(input.name),
      streaming: /dm-nax/i.test(input.name),
    };
  }
  if (kind === "speaker") {
    return {
      ...base,
      wattsPerChannel: input.ai?.powerWatts ? Math.round(input.ai.powerWatts) : null,
      nominalOhms: input.ai?.impedanceOhms ?? null,
    };
  }
  if (kind === "streamer") return { ...base, streaming: true, networked: true };
  if (kind === "switch" || kind === "processor") return { ...base, networked: true };
  return base;
}

/** Canales que hacen falta para `speakers` parlantes. Con amplificador estable a 4 Ω van 2 de 8 Ω por canal. */
export function channelsNeeded(speakers: number, zones: number, amp: Pick<SystemSpec, "minOhms"> | null, speakerOhms: number | null): number {
  if (speakers <= 0) return 0;
  const perChannel = amp?.minOhms != null && amp.minOhms <= 4 && (speakerOhms ?? 8) >= 8 ? 2 : 1;
  return Math.max(Math.ceil(speakers / perChannel), Math.max(1, zones));
}
