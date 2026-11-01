"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveActivity } from "@/app/actions/resident";
import type { PersonaResult, PublicPersonaQuestion } from "@/lib/persona";
import { useModuleProgress } from "./ProgressContext";

export function PersonaQuiz({
  moduleSlug,
  activityId,
  questions,
  tiebreakers,
  initial,
  initialResult,
}: {
  moduleSlug: string;
  activityId: string;
  questions: PublicPersonaQuestion[];
  tiebreakers: PublicPersonaQuestion[];
  initial: Record<string, string>;
  initialResult: Pick<PersonaResult, "needsTiebreak" | "complete"> | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [result, setResult] = useState(initialResult);
  const [error, setError] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  const { report } = useModuleProgress();
  const answered = questions.filter((q) => answers[q.id]).length;

  function choose(qid: string, oid: string) {
    const next = { ...answers, [qid]: oid };
    setAnswers(next);
    setError(false);
    start(async () => {
      try {
        const res = await saveActivity(moduleSlug, activityId, { answers: next });
        if (!res.ok) throw new Error();
        const wasComplete = !!result?.complete;
        setResult(res.result ? { needsTiebreak: res.result.needsTiebreak, complete: res.result.complete } : null);
        report(`act:${activityId}`, res.complete);
        // Refresh the results section (and the intro slide's persona line) when the result changes.
        if (res.complete || wasComplete) router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-5">
      <p className="font-semibold" aria-live="polite">
        {answered} of {questions.length} answered
      </p>
      {questions.map((q, i) => (
        <Question key={q.id} q={q} n={i + 1} name={activityId} value={answers[q.id]} onChoose={choose} />
      ))}
      {result?.needsTiebreak && (
        <div className="space-y-5 rounded-2xl border-2 border-yellow bg-yellow-wash p-4">
          <p className="text-lg">
            <strong>A few more questions.</strong> Your top two personas finished within one point of each other. Answer these tiebreakers to separate them.
          </p>
          {tiebreakers.map((q, i) => (
            <Question key={q.id} q={q} n={questions.length + i + 1} name={activityId} value={answers[q.id]} onChoose={choose} />
          ))}
        </div>
      )}
      <p aria-live="polite" className="font-semibold">
        {result?.complete ? (
          <a href="#results" className="text-teal-ink underline">
            ✓ Done! See your results below.
          </a>
        ) : (
          error && <span className="text-coral-ink">That didn&apos;t save. Please try again.</span>
        )}
      </p>
    </div>
  );
}

function Question({ q, n, name, value, onChoose }: { q: PublicPersonaQuestion; n: number; name: string; value?: string; onChoose: (qid: string, oid: string) => void }) {
  return (
    <fieldset className="rounded-2xl border-2 border-gray-brand/30 p-4">
      <legend className="px-1 text-lg font-bold">
        {n}. {q.prompt}
      </legend>
      <div className="mt-2 space-y-2">
        {q.options.map((o) => {
          const on = value === o.id;
          return (
            <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${on ? "border-teal-ink bg-teal-wash" : "border-gray-brand/30 hover:border-teal"}`}>
              <input type="radio" name={`${name}-${q.id}`} className="mt-1 h-5 w-5 accent-teal-ink" checked={on} onChange={() => onChoose(q.id, o.id)} />
              <span>
                <span className="font-bold">{o.id}.</span> {o.text}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
