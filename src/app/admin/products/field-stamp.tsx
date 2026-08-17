export function FieldStamp({ at }: { at?: string }) {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <span className="block text-[10px] leading-tight text-gray-400 mt-0.5">
      act. {formatted}
    </span>
  );
}
