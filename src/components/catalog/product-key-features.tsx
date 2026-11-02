/**
 * «Características destacadas» de la ficha: las del fabricante, solo cuando la
 * ficha ya está en castellano (translatedAt). Las que siguen en inglés no se
 * muestran para no mezclar idiomas en el documento que ve el cliente.
 */
export function ProductKeyFeatures({ features, translated }: { features: unknown; translated: boolean }) {
  const list = Array.isArray(features) ? features.filter((f): f is string => typeof f === "string" && f.trim().length > 0) : [];
  if (!translated || list.length === 0) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">Características destacadas</h3>
      <ul className="grid gap-x-8 gap-y-1.5 text-[15px] leading-relaxed sm:grid-cols-2">
        {list.map((feature, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
