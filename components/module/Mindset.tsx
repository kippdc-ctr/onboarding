"use client";

import { useState, useTransition } from "react";
import { saveActivity } from "@/app/actions/resident";
import { useModuleProgress } from "./ProgressContext";

const DEFAULT_LABELS = ["Strongly disagree", "Disagree", "Not sure", "Agree", "Strongly agree"];

/** Ungraded 1-5 ratings. For the "after" check, `before` holds the earlier ratings to compare against. */
export function Mindset({
  moduleSlug,
  activityId,
  statements,
  initial,
  before,
  sample,
  labels,
}: {
  moduleSlug: string;
  activityId: string;
  statements: { id: string; text: string }[];
  initial: Record<string, string>;
  before?: Record<string, string> | null;
  sample?: boolean;
  labels?: string[];
}) {
  const LABELS = labels?.length === 5 ? labels : DEFAULT_LABELS;
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(Object.keys(initial).length ? "saved" : "idle");
  const [, start] = useTransition();
  const { report } = useModuleProgress();
  const done = statements.length > 0 && statements.every((s) => answers[s.id]);

  function rate(id: string, v: string) {
    const next = { ...answers, [id]: v };
    setAnswers(next);
    setStatus("saving");
    start(async () => {
      try {
        const res = await saveActivity(moduleSlug, activityId, { answers: next });
        if (!res.ok) throw new Error();
        setStatus("saved");
        report(`act:${activityId}`, res.complete);
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <div className="space-y-4">
      {sample && <p className="inline-block rounded bg-yellow px-2 text-sm font-bold">Sample statements, replace</p>}
      {statements.map((s, i) => (
        <fieldset key={s.id} className="rounded-2xl border-2 border-gray-brand/30 p-4">
          <legend className="px-1 text-lg font-semibold">
            {i + 1}. {s.text}
          </legend>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {LABELS.map((label, idx) => {
              const v = String(idx + 1);
              const on = answers[s.id] === v;
              return (
                <label
                  key={v}
                  className={`flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-1 text-center text-xs font-semibold sm:text-sm ${
                    on ? "border-teal-ink bg-teal-wash text-teal-ink" : "border-gray-brand/30 hover:border-teal"
                  }`}
                >
                  <input type="radio" name={`${activityId}-${s.id}`} value={v} checked={on} onChange={() => rate(s.id, v)} className="sr-only" />
                  <span className="text-lg font-bold">{v}</span>
                  <span className="leading-tight">{label}</span>
                </label>
              );
            })}
          </div>
          {before && done && (
            <p className="mt-2 text-sm">
              Before: <strong>{before[s.id] ? `${before[s.id]} (${LABELS[Number(before[s.id]) - 1]})` : "not rated"}</strong> · Now:{" "}
              <strong>
                {answers[s.id]} ({LABELS[Number(answers[s.id]) - 1]})
              </strong>
            </p>
          )}
        </fieldset>
      ))}
      <p className="text-sm" aria-live="polite">
        {status === "saving" && <span className="text-muted">Saving…</span>}
        {status === "saved" && <span className="font-semibold text-teal-ink">✓ Saved{done ? "" : ". Rate every statement to finish."}</span>}
        {status === "error" && <span className="font-semibold text-coral-ink">Couldn&apos;t save. Please try again.</span>}
      </p>
    </div>
  );
}
