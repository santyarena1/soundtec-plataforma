export const REQUEST_TYPE_LABELS: Record<string, string> = {
  QUOTE: "Cotización",
  ORDER: "Pedido",
  CONSULTATION: "Consulta",
};

export function requestTypeLabel(type: string): string {
  return REQUEST_TYPE_LABELS[type] || type;
}
