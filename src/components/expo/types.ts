/** Tipos compartidos por la UI del asistente (cliente). */

export interface ChatSource {
  type: string;
  productId: string;
  productName: string;
  title: string;
  detail?: string;
  url?: string;
  page?: number;
}

export interface ChatProduct {
  id: string;
  name: string;
  brandName: string | null;
  imageUrl: string | null;
  href: string;
  reason?: string;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string;
  confidence?: string;
  products?: ChatProduct[];
  sources?: ChatSource[];
  suggestions?: string[];
  /** Se muestra una tarjeta de contacto debajo de esta respuesta. */
  reminder?: boolean;
  error?: boolean;
}

export interface ChatApiResponse {
  ok: boolean;
  error?: string;
  sessionId?: string;
  questionCount?: number;
  showLeadReminder?: boolean;
  answer?: string;
  status?: string;
  confidence?: string;
  products?: ChatProduct[];
  sources?: ChatSource[];
  suggestions?: string[];
}

export interface LeadFormValues {
  name: string;
  email: string;
  phone: string;
  company: string;
  projectInfo: string;
}

export const EMPTY_LEAD: LeadFormValues = {
  name: "",
  email: "",
  phone: "",
  company: "",
  projectInfo: "",
};
