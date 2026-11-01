"use client";

import { useRef, useState } from "react";
import { saveActivity } from "@/app/actions/resident";
import { wordCount, type WorksheetField } from "@/lib/content";
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
      {fields.map((f) => (
        <WorksheetInput key={f.id} idPrefix={activityId} field={f} value={answers[f.id] ?? ""} onChange={(v) => onChange(f.id, v)} />
      ))}
      <p className="text-sm" aria-live="polite">
        {status === "saving" && <span className="text-muted">Saving…</span>}
        {status === "saved" && <span className="font-semibold text-teal-ink">✓ Saved under your name</span>}
        {status === "error" && <span className="font-semibold text-coral-ink">Couldn&apos;t save. Please try again.</span>}
      </p>
    </div>
  );
}

/** One worksheet box: text, dropdown, or tick box, with optional word counter and sample. Shared with the intro slide. */
export function WorksheetInput({ idPrefix, field: f, value, onChange }: { idPrefix: string; field: WorksheetField; value: string; onChange: (v: string) => void }) {
  const id = `${idPrefix}-${f.id}`;
  if (f.kind === "checkbox") {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input id={id} type="checkbox" className="mt-1 h-6 w-6 accent-teal-ink" checked={value === "yes"} onChange={(e) => onChange(e.target.checked ? "yes" : "")} />
        <span>
          {f.label}
          {f.help && <span className="block text-sm text-muted">{f.help}</span>}
        </span>
      </label>
    );
  }
  const words = f.minWords || f.maxWords ? wordCount(value) : 0;
  const under = f.minWords && words < f.minWords;
  const over = f.maxWords && words > f.maxWords;
  return (
    <div>
      <label htmlFor={id} className="label">
        {f.label} {f.optional && <span className="font-normal text-muted">(if it applies)</span>}
      </label>
      {f.help && (
        <p id={`${id}-help`} className="mb-1 text-sm text-muted">
          {f.help}
        </p>
      )}
      {f.sample && (
        <details className="mb-2 rounded-xl bg-white p-3">
          <summary className="link cursor-pointer text-sm">{f.sampleLabel ?? "Show a sample"}</summary>
          <p className="mt-2 whitespace-pre-line">{f.sample}</p>
        </details>
      )}
      {f.options ? (
        <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={f.help ? `${id}-help` : undefined}>
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={f.help ? `${id}-help` : undefined}
        />
      )}
      {(f.minWords || f.maxWords) && (
        <p className={`mt-1 text-sm font-semibold ${under || over ? "text-coral-ink" : "text-teal-ink"}`} aria-live="polite">
          {words} word{words === 1 ? "" : "s"} {f.hardMax ? `(limit ${f.maxWords})` : `(target ${f.minWords ?? 0} to ${f.maxWords ?? "any"})`}
          {over && (f.hardMax ? " · over the limit; trim it to finish" : " · a little over the target; trimming is optional")}
        </p>
      )}
    </div>
  );
}
