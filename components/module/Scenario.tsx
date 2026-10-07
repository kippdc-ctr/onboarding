"use client";

import { useRef, useState } from "react";
import { saveActivity } from "@/app/actions/resident";
import { useModuleProgress } from "./ProgressContext";

export function Scenario({
  moduleSlug,
  activityId,
  scenario,
  prompts,
  sample,
  initial,
}: {
  moduleSlug: string;
  activityId: string;
  scenario: string;
  prompts: { id: string; prompt: string }[];
  sample?: boolean;
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
    }, 1200);
  }

  return (
    <div className="rounded-2xl border-2 border-teal-light p-4">
      {sample && <p className="mb-2 inline-block rounded bg-yellow px-2 text-sm font-bold">Sample scenario, replace</p>}
      <blockquote className="rounded-xl bg-teal-wash p-4 text-lg">{scenario}</blockquote>
      <div className="mt-4 space-y-4">
        {prompts.map((p, i) => (
          <div key={p.id}>
            <label htmlFor={`${activityId}-${p.id}`} className="label">
              {i + 1}. {p.prompt}
            </label>
            <textarea id={`${activityId}-${p.id}`} className="input min-h-24" rows={3} value={answers[p.id] ?? ""} onChange={(e) => onChange(p.id, e.target.value)} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm" aria-live="polite">
        {status === "saving" && <span className="text-muted">Saving…</span>}
        {status === "saved" && <span className="font-semibold text-teal-ink">✓ Saved</span>}
        {status === "error" && <span className="font-semibold text-coral-ink">Couldn&apos;t save. Please try again.</span>}
      </p>
    </div>
  );
}
