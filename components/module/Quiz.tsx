"use client";

import { useState, useTransition } from "react";
import { answerQuestion } from "@/app/actions/resident";
import { useModuleProgress } from "./ProgressContext";

export type PublicQuestion = { id: string; prompt: string; options: { id: string; text: string }[] };
export type Feedback = { selected: string; correct: boolean; correctOption: string; explanation: string };

export function Quiz({
  moduleSlug,
  questions,
  attemptNo: initialAttempt,
  initialFeedback,
  bestScore,
  attemptCount,
}: {
  moduleSlug: string;
  questions: PublicQuestion[];
  attemptNo: number;
  initialFeedback: Record<string, Feedback>;
  bestScore: number | null;
  attemptCount: number;
}) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>(initialFeedback);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [best, setBest] = useState(bestScore);
  const [attempts, setAttempts] = useState(attemptCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { report } = useModuleProgress();

  const answered = Object.keys(feedback).length;
  const correctNow = Object.values(feedback).filter((f) => f.correct).length;
  const allAnswered = answered === questions.length;

  function submit(q: PublicQuestion) {
    const sel = choice[q.id];
    if (!sel) return;
    setError(null);
    start(async () => {
      const res = await answerQuestion(moduleSlug, q.id, sel, attempt);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const next = { ...feedback, [q.id]: { selected: sel, correct: res.correct, correctOption: res.correctOption, explanation: res.explanation } };
      setFeedback(next);
      if (Object.keys(feedback).length === 0 && attempt > attempts) setAttempts(attempt);
      const score = Object.values(next).filter((f) => f.correct).length;
      setBest((b) => Math.max(b ?? 0, score));
      report(`quiz:${q.id}`, true);
    });
  }

  function retake() {
    setAttempt((a) => a + 1);
    setFeedback({});
    setChoice({});
    setError(null);
    document.getElementById(`q-${questions[0]?.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-5">
      <p className="text-base text-muted">
        Answer each question to see feedback right away. Retakes are allowed; your best score counts.
        {best !== null && (
          <>
            {" "}
            <strong className="text-ink">
              Best accuracy: {best}/{questions.length}
            </strong>{" "}
            ({Math.max(attempts, 1)} attempt{Math.max(attempts, 1) === 1 ? "" : "s"}).
          </>
        )}
      </p>
      {questions.map((q, qi) => {
        const fb = feedback[q.id];
        return (
          <fieldset key={`${q.id}-${attempt}`} id={`q-${q.id}`} className="scroll-mt-32 rounded-2xl border-2 border-gray-brand/30 p-4">
            <legend className="px-1 text-lg font-bold">
              {qi + 1}. {q.prompt}
            </legend>
            <div className="mt-2 space-y-2">
              {q.options.map((o) => {
                const isSel = (fb?.selected ?? choice[q.id]) === o.id;
                const isRight = fb && o.id === fb.correctOption;
                const isWrongSel = fb && isSel && !fb.correct;
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${
                      isRight ? "border-teal bg-teal-wash" : isWrongSel ? "border-coral bg-coral-wash" : isSel ? "border-teal-ink" : "border-gray-brand/30"
                    } ${fb ? "cursor-default" : "hover:border-teal"}`}
                  >
                    <input
                      type="radio"
                      name={`${q.id}-${attempt}`}
                      value={o.id}
                      className="mt-1 h-5 w-5 accent-teal-ink"
                      checked={isSel}
                      disabled={!!fb || pending}
                      onChange={() => setChoice((c) => ({ ...c, [q.id]: o.id }))}
                    />
                    <span>
                      <span className="font-bold">{o.id}.</span> {o.text}
                      {isRight && <span className="ml-2 font-bold text-teal-ink">✓ Correct answer</span>}
                      {isWrongSel && <span className="ml-2 font-bold text-coral-ink">✗ Your answer</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {fb ? (
              <p role="status" className={`mt-3 rounded-xl p-3 font-semibold ${fb.correct ? "bg-teal-wash text-teal-ink" : "bg-coral-wash text-coral-ink"}`}>
                {fb.correct ? "Correct! " : "Not quite. "}
                <span className="font-normal text-ink">{fb.explanation}</span>
              </p>
            ) : (
              <button type="button" className="btn-small mt-3" disabled={!choice[q.id] || pending} onClick={() => submit(q)}>
                Check answer
              </button>
            )}
          </fieldset>
        );
      })}
      {error && (
        <p role="alert" className="font-semibold text-coral-ink">
          {error}
        </p>
      )}
      {allAnswered && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-teal-wash p-4">
          <p className="font-bold">
            This attempt: {correctNow}/{questions.length}
          </p>
          <button type="button" className="btn-small" onClick={retake}>
            Retake knowledge check
          </button>
        </div>
      )}
    </div>
  );
}
