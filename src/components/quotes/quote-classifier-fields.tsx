import { Label, Select } from "@/components/ui/input";
import type { ClassifierDTO } from "@/lib/quote-classifiers";

export function QuoteClassifierFields({
  classifiers,
  picks,
  issued,
}: {
  classifiers: ClassifierDTO[];
  picks?: Record<string, string>;
  issued?: boolean;
}) {
  if (classifiers.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {classifiers.map((classifier) => (
        <div key={classifier.id}>
          <Label htmlFor={`classifier_${classifier.id}`}>{classifier.label}</Label>
          {classifier.hint ? <p className="mb-1 text-[11px] text-muted-foreground">{classifier.hint}</p> : null}
          <Select
            id={`classifier_${classifier.id}`}
            name={`classifier_${classifier.id}`}
            defaultValue={picks?.[classifier.id] || ""}
            disabled={issued}
          >
            <option value="">Elegir…</option>
            {classifier.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}
