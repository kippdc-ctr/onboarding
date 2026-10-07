"use client";

import { useState, useTransition } from "react";
import { saveActivity } from "@/app/actions/resident";
import { useModuleProgress } from "./ProgressContext";

type Card = { id: string; text: string; answer: string };

export function Matching({
  moduleSlug,
  activityId,
  title,
  categories,
  cards,
  sample,
  initial,
  initiallyComplete,
}: {
  moduleSlug: string;
  activityId: string;
  title: string;
  categories: string[];
  cards: Card[];
  sample?: boolean;
  initial: Record<string, string>;
  initiallyComplete: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [checked, setChecked] = useState(initiallyComplete);
  const [complete, setComplete] = useState(initiallyComplete);
  const [pending, start] = useTransition();
  const { report } = useModuleProgress();

  function check() {
    setChecked(true);
    start(async () => {
      const res = await saveActivity(moduleSlug, activityId, { answers });
      if (res.complete) {
        setComplete(true);
        report(`act:${activityId}`, true);
      }
    });
  }

  const allChosen = cards.every((c) => answers[c.id]);
  const wrong = cards.filter((c) => answers[c.id] && answers[c.id] !== c.answer).length;

  return (
    <div className="rounded-2xl border-2 border-teal-light p-4">
      <h3 className="h3">{title}</h3>
      {sample && <p className="mt-1 inline-block rounded bg-yellow px-2 text-sm font-bold">Sample cards, replace</p>}
      <p className="mt-2 text-muted">Choose a match for each card, then check your answers. Keep going until they&apos;re all correct.</p>
      <ul className="mt-3 space-y-3">
        {cards.map((c) => {
          const state = checked && answers[c.id] ? (answers[c.id] === c.answer ? "right" : "wrong") : null;
          return (
            <li key={c.id} className={`rounded-xl border-2 p-3 ${state === "right" ? "border-teal bg-teal-wash" : state === "wrong" ? "border-coral bg-coral-wash" : "border-gray-brand/30"}`}>
              <label htmlFor={`${activityId}-${c.id}`} className="block">
                {c.text}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <select
                  id={`${activityId}-${c.id}`}
                  className="input max-w-64"
                  value={answers[c.id] ?? ""}
                  disabled={complete}
                  onChange={(e) => {
                    setAnswers((a) => ({ ...a, [c.id]: e.target.value }));
                    setChecked(false);
                  }}
                >
                  <option value="">Choose…</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {state === "right" && <span className="font-bold text-teal-ink">✓</span>}
                {state === "wrong" && <span className="font-bold text-coral-ink">Try again</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4" aria-live="polite">
        {complete ? (
          <p className="font-bold text-teal-ink">✓ Finished! Every card is matched correctly.</p>
        ) : (
          <>
            <button type="button" className="btn-small" disabled={!allChosen || pending} onClick={check}>
              Check my matches
            </button>
            {checked && wrong > 0 && !pending && (
              <p className="mt-2 font-semibold text-coral-ink">
                {wrong} card{wrong === 1 ? " needs" : "s need"} another look.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
