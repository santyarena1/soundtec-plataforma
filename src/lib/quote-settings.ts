import { getSetting, setSetting } from "@/lib/settings";

export const QUOTE_SETTING_KEYS = {
  prefix: "quotes.number.prefix",
  includeDate: "quotes.number.include_date",
  dateToken: "quotes.number.date_token",
  datePosition: "quotes.number.date_position",
  separator: "quotes.number.separator",
  padding: "quotes.number.padding",
  nextSequence: "quotes.number.next_sequence",
  defaultLayout: "quotes.default_layout",
  defaultProfile: "quotes.default_profile",
  alternativesDefault: "quotes.alternatives_default",
  deliveryOptions: "quotes.delivery_options",
  defaultIva: "quotes.default_iva",
  showDeliveryDefault: "quotes.show_delivery_default",
  validityDays: "quotes.terms.validity_days",
  paymentReference: "quotes.terms.payment_reference",
  paymentTerms: "quotes.terms.payment_terms",
  productWarranty: "quotes.terms.product_warranty",
  companyTagline: "quotes.company.tagline",
  companyAddress: "quotes.company.address",
  companyPhone: "quotes.company.phone",
  companyEmail: "quotes.company.email",
  companyWeb: "quotes.company.web",
  companyLogoUrl: "quotes.company.logo_url",
  companyHeaderUrl: "quotes.company.header_url",
  companyBrandsUrl: "quotes.company.brands_url",
  companyIsoUrl: "quotes.company.iso_url",
  brandsWidth: "quotes.company.brands_width",
  brandsAlign: "quotes.company.brands_align",
  brandsDisplayMode: "quotes.brands.display_mode",
  isoWidth: "quotes.company.iso_width",
  isoAlign: "quotes.company.iso_align",
  openaiKey: "openai.api_key",
  openaiModel: "openai.model",
  serperKey: "serper.api_key",
  anthropicKey: "anthropic.api_key",
  geminiKey: "gemini.api_key",
  imageGenKey: "images.api_key",
  imageGenProvider: "images.provider",
  higgsfieldKey: "higgsfield.api_key",
  visionModel: "quotes.ai.vision_model",
  writerModel: "quotes.ai.writer_model",
} as const;

export const DEFAULT_DELIVERY_OPTIONS = [
  "Inmediata",
  "A confirmar",
  "7 días",
  "15 días",
  "20 días",
  "Bajo pedido",
];

export type QuoteNumberingConfig = {
  prefix: string;
  includeDate: boolean;
  dateToken: string;
  datePosition: "after_prefix" | "before_number";
  separator: string;
  padding: number;
  nextSequence: number;
};

export async function getQuoteNumberingConfig(): Promise<QuoteNumberingConfig> {
  const [
    prefix,
    includeDate,
    dateToken,
    datePosition,
    separator,
    padding,
    nextSequence,
  ] = await Promise.all([
    getSetting(QUOTE_SETTING_KEYS.prefix, "COT"),
    getSetting(QUOTE_SETTING_KEYS.includeDate, "false"),
    getSetting(QUOTE_SETTING_KEYS.dateToken, "YYYY"),
    getSetting(QUOTE_SETTING_KEYS.datePosition, "after_prefix"),
    getSetting(QUOTE_SETTING_KEYS.separator, ""),
    getSetting(QUOTE_SETTING_KEYS.padding, "5"),
    getSetting(QUOTE_SETTING_KEYS.nextSequence, "14544"),
  ]);

  return {
    prefix: prefix || "COT",
    includeDate: includeDate === "true",
    dateToken: dateToken || "YYYY",
    datePosition: (datePosition === "before_number" ? "before_number" : "after_prefix") as "after_prefix" | "before_number",
    separator,
    padding: Math.min(8, Math.max(1, Number(padding) || 5)),
    nextSequence: Math.max(1, Number(nextSequence) || 14544),
  };
}

export function formatQuoteNumber(input: {
  prefix: string;
  includeDate: boolean;
  dateToken: string;
  datePosition: "after_prefix" | "before_number";
  separator: string;
  padding: number;
  sequence: number;
  at?: Date;
}): string {
  const n = String(input.sequence).padStart(input.padding, "0");
  const sep = input.separator;
  let datePart = "";
  if (input.includeDate) {
    const d = input.at ?? new Date();
    const yyyy = String(d.getFullYear());
    const yy = yyyy.slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    datePart =
      input.dateToken === "YY"
        ? yy
        : input.dateToken === "YYYYMM"
          ? `${yyyy}${mm}`
          : input.dateToken === "YYYYMMDD"
            ? `${yyyy}${mm}${dd}`
            : yyyy;
  }

  const parts: string[] = [input.prefix];
  if (input.includeDate && input.datePosition === "after_prefix") {
    parts.push(datePart, n);
  } else if (input.includeDate && input.datePosition === "before_number") {
    parts.push(n, datePart);
  } else {
    parts.push(n);
  }
  return parts.filter(Boolean).join(sep);
}

export async function allocateQuoteNumber(): Promise<string> {
  const cfg = await getQuoteNumberingConfig();
  const number = formatQuoteNumber({ ...cfg, sequence: cfg.nextSequence });
  await setSetting(QUOTE_SETTING_KEYS.nextSequence, String(cfg.nextSequence + 1), {
    description: "Siguiente correlativo de cotización",
  });
  return number;
}

export async function getDeliveryOptions(): Promise<string[]> {
  const raw = await getSetting(QUOTE_SETTING_KEYS.deliveryOptions, "");
  if (!raw.trim()) return DEFAULT_DELIVERY_OPTIONS;
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
