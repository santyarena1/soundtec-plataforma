"use client";

import { audioAdvice, platformAdvice } from "@/services/room-builder/platform-guide";

export function PlatformGuideCard({
  category,
  platform,
}: {
  category: string;
  platform: string | null;
}) {
  const plat = platformAdvice(platform || "none");
  const audio = audioAdvice(category, platform || "none");
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-snug text-slate-700">
      <p className="text-xs font-semibold text-slate-900">{plat.title}</p>
      <p className="mt-1">{plat.when}</p>
      <p className="mt-1 text-slate-500">{plat.notFor}</p>
      <p className="mt-2 text-xs font-semibold text-slate-900">Audio</p>
      <ul className="mt-1 space-y-1">
        {audio.map((row) => (
          <li key={row.family}>
            <span
              className={
                row.fit === "recomendado"
                  ? "font-semibold text-emerald-800"
                  : row.fit === "no"
                    ? "text-slate-400"
                    : "text-slate-700"
              }
            >
              {row.label}
              {row.fit === "recomendado"
                ? " · conviene"
                : row.fit === "no"
                  ? " · no para esto"
                  : " · alternativa"}
            </span>
            {row.fit !== "no" ? ` — ${row.why}` : ` — ${row.why}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
