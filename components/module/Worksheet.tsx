"use client";

import { useRef, useState } from "react";
import { saveActivity } from "@/app/actions/resident";
import type { WorksheetField } from "@/lib/content";
import { useModuleProgress } from "./ProgressContext";

/** A set of labeled answer boxes (and dropdowns) that autosave together. */
export function Worksheet({
  moduleSlug,
  activityId,
  title,
  fields,
  initial,
}: {
  moduleSlug: string;
  activityId: string;
  title?: string;
  fields: WorksheetField[];
  initial: Record<string, string>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(Object.values(initial).some(Boolean) ? "saved" : "idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { report } = useModuleProgress();

  function onChange(id: string, v: string) {
    const next = { ...answers, [id]: v };
    setAnswers(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const res = await saveActivity(moduleSlug, activityId, { answers: next });
        if (!res.ok) throw new Error();
        setStatus("saved");
        report(`act:${activityId}`, res.complete);
      } catch {
        setStatus("error");
      }
    }, 1000);
  }

  return (
    <div className="space-y-4 rounded-2xl border-2 border-yellow bg-yellow-wash p-4">
      {title && <h3 className="h3">{title}</h3>}
      {fields.map((f) => {
        const id = `${activityId}-${f.id}`;
        return (
          <div key={f.id}>
            <label htmlFor={id} className="label">
              {f.label} {f.optional && <span className="font-normal text-muted">(if it applies)</span>}
            </label>
            {f.help && (
              <p id={`${id}-help`} className="mb-1 text-sm text-muted">
                {f.help}
              </p>
            )}
            {f.options ? (
              <select id={id} className="input" value={answers[f.id] ?? ""} onChange={(e) => onChange(f.id, e.target.value)} aria-describedby={f.help ? `${id}-help` : undefined}>
                <option value="">Choose…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <textarea
                id={id}
                className="input min-h-20"
                rows={f.rows ?? 2}
                value={answers[f.id] ?? ""}
                onChange={(e) => onChange(f.id, e.target.value)}
                aria-describedby={f.help ? `${id}-help` : undefined}
              />
            )}
          </div>
        );
      })}
      <p className="text-sm" aria-live="polite">
        {status === "saving" && <span className="text-muted">Saving…</span>}
        {status === "saved" && <span className="font-semibold text-teal-ink">✓ Saved under your name</span>}
        {status === "error" && <span className="font-semibold text-coral-ink">Couldn&apos;t save. Please try again.</span>}
      </p>
    </div>
  );
}
