"use client";

import { useState } from "react";

/** Ungraded practice: try your own version, then reveal one possible answer. Nothing is saved. */
export function Reveal({ items, revealLabel = "Reveal one possible version", sample }: { items: { statement: string; reveal: string }[]; revealLabel?: string; sample?: boolean }) {
  const [shown, setShown] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-3">
      {sample && <p className="inline-block rounded bg-yellow px-2 text-sm font-bold">Sample statements, replace</p>}
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border-2 border-gray-brand/30 p-4">
          <p className="text-lg font-semibold">&ldquo;{it.statement}&rdquo;</p>
          <label className="mt-2 block">
            <span className="text-sm text-muted">Your reframe (just for you, not saved)</span>
            <textarea className="input mt-1 min-h-16" rows={2} />
          </label>
          {shown[i] ? (
            <p className="mt-3 rounded-xl bg-teal-wash p-3" role="status">
              <span className="font-semibold text-teal-ink">One possible version: </span>
              {it.reveal}
            </p>
          ) : (
            <button type="button" className="btn-small mt-3" onClick={() => setShown((s) => ({ ...s, [i]: true }))}>
              {revealLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
