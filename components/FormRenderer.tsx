"use client";

import { useRef, useState, useTransition } from "react";
import type { FormQuestion } from "@/lib/content";
import { OTHER, type FormAnswers } from "@/lib/forms";

type Q = FormQuestion & { resolvedOptions: string[] };

export function FormRenderer({
  questions,
  initial,
  saveDraft,
  submit,
  submitLabel = "Submit",
  onDone,
}: {
  questions: Q[];
  initial: FormAnswers;
  saveDraft?: (answers: FormAnswers) => Promise<{ ok: boolean; error?: string }>;
  submit: (answers: FormAnswers) => Promise<{ ok: boolean; errors: Record<string, string> }>;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const [answers, setAnswers] = useState<FormAnswers>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function set(id: string, v: string | string[] | number) {
    const next = { ...answers, [id]: v };
    setAnswers(next);
    if (errors[id]) setErrors((e) => ({ ...e, [id]: "" }));
    if (!saveDraft) return;
    setDraft("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setDraft("saving");
      try {
        const res = await saveDraft(next);
        setDraft(res.ok ? "saved" : "error");
      } catch {
        setDraft("error");
      }
    }, 1200);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    start(async () => {
      const res = await submit(answers);
      if (res.ok) {
        setErrors({});
        onDone?.();
      } else {
        setErrors(res.errors);
        const first = Object.keys(res.errors)[0];
        if (first) document.getElementById(`fq-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {questions.map((q) => {
        if (q.type === "section")
          return (
            <div key={q.id} className="pt-4">
              <h2 className="h2">{q.prompt}</h2>
              {q.help && <p className="mt-1 text-muted">{q.help}</p>}
            </div>
          );
        const err = errors[q.id];
        const id = `fq-${q.id}`;
        const v = answers[q.id];
        return (
          <div key={q.id} id={id} className={`card scroll-mt-32 ${err ? "border-2 border-coral" : ""}`}>
            <fieldset aria-describedby={err ? `${id}-err` : q.help ? `${id}-help` : undefined}>
              <legend className="text-lg font-bold">
                {q.prompt} {q.required ? <span className="text-coral-ink" aria-label="required">*</span> : <span className="text-sm font-normal text-muted">(optional)</span>}
              </legend>
              {q.help && (
                <p id={`${id}-help`} className="mt-1 text-muted">
                  {q.help}
                </p>
              )}
              <div className="mt-3">
                {q.type === "short_text" && (
                  <input aria-label={q.prompt} className="input" value={(v as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                )}
                {q.type === "long_text" && (
                  <textarea aria-label={q.prompt} className="input min-h-28" rows={4} value={(v as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                )}
                {q.type === "single_choice" && (
                  <div className="space-y-2">
                    {q.resolvedOptions.map((o) => (
                      <label key={o} className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-gray-brand/30 p-3 hover:border-teal">
                        <input type="radio" name={q.id} className="mt-1 h-5 w-5 accent-teal-ink" checked={v === o} onChange={() => set(q.id, o)} />
                        <span>{o}</span>
                      </label>
                    ))}
                    {v === OTHER && (
                      <input
                        aria-label="Other (please specify)"
                        placeholder="Please specify"
                        className="input"
                        value={(answers[`${q.id}__other`] as string) ?? ""}
                        onChange={(e) => set(`${q.id}__other`, e.target.value)}
                      />
                    )}
                  </div>
                )}
                {q.type === "multi_select" && (
                  <div className="space-y-2">
                    {q.resolvedOptions.map((o) => {
                      const arr = Array.isArray(v) ? v : [];
                      return (
                        <label key={o} className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-gray-brand/30 p-3 hover:border-teal">
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 accent-teal-ink"
                            checked={arr.includes(o)}
                            onChange={(e) => set(q.id, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
                          />
                          <span>{o}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {q.type === "scale" && (
                  <div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label
                          key={n}
                          className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border-2 text-lg font-bold ${
                            v === n ? "border-teal-ink bg-teal-wash text-teal-ink" : "border-gray-brand/30 hover:border-teal"
                          }`}
                        >
                          <input type="radio" name={q.id} className="sr-only" checked={v === n} onChange={() => set(q.id, n)} />
                          {n}
                          <span className="sr-only">
                            {n === 1 ? ` (${q.minLabel})` : n === 5 ? ` (${q.maxLabel})` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-sm text-muted" aria-hidden="true">
                      <span>1 = {q.minLabel}</span>
                      <span>5 = {q.maxLabel}</span>
                    </div>
                  </div>
                )}
              </div>
              {err && (
                <p id={`${id}-err`} role="alert" className="mt-2 font-semibold text-coral-ink">
                  {err}
                </p>
              )}
            </fieldset>
          </div>
        );
      })}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-4 border-t border-gray-brand/30 bg-white/95 px-4 py-3 backdrop-blur">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Submitting…" : submitLabel}
        </button>
        <span className="text-sm" aria-live="polite">
          {errorCount > 0 && <span className="font-semibold text-coral-ink">Please answer the {errorCount} required question{errorCount === 1 ? "" : "s"} marked above.</span>}
          {errorCount === 0 && draft === "saving" && <span className="text-muted">Saving draft…</span>}
          {errorCount === 0 && draft === "saved" && <span className="font-semibold text-teal-ink">✓ Draft saved</span>}
          {errorCount === 0 && draft === "error" && <span className="font-semibold text-coral-ink">Couldn&apos;t save your draft.</span>}
        </span>
      </div>
    </form>
  );
}
