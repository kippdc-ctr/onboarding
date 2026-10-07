"use client";

import { useState, useTransition } from "react";
import { toggleChecklist, toggleItemCheck } from "@/app/actions/resident";
import { useModuleProgress } from "./module/ProgressContext";

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-ink px-2 py-0.5 text-xs font-bold text-white" title="Confirmed by the CTR team">
      ✓ Verified
    </span>
  );
}

/** A resident-ticked item. `target` decides which action records it. */
export function CheckItem({
  target,
  label,
  description,
  note,
  checked: initial,
  verified,
  disabled,
  disabledReason,
  progressKey,
  children,
}: {
  target: { kind: "phase"; itemId: string } | { kind: "module"; moduleSlug: string; itemId: string };
  label: string;
  description?: string | null;
  note?: string | null;
  checked: boolean;
  verified: boolean;
  disabled?: boolean;
  disabledReason?: string;
  progressKey?: string;
  children?: React.ReactNode;
}) {
  const [checked, setChecked] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const { report } = useModuleProgress();
  const id = `chk-${target.kind}-${"moduleSlug" in target ? target.moduleSlug + "-" : ""}${target.itemId}`;

  function onChange(next: boolean) {
    setChecked(next);
    setError(false);
    start(async () => {
      const res = target.kind === "phase" ? await toggleItemCheck(target.itemId, next) : await toggleChecklist(target.moduleSlug, target.itemId, next);
      if (!res.ok) {
        setChecked(!next);
        setError(true);
      } else if (progressKey) report(progressKey, next);
    });
  }

  return (
    <li className="flex flex-col gap-3 border-b border-gray-brand/20 py-4 last:border-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-1 h-7 w-7 shrink-0 cursor-pointer accent-teal-ink"
          checked={checked}
          disabled={disabled || pending}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={description || note ? `${id}-desc` : undefined}
        />
        <div>
          <label htmlFor={id} className={`cursor-pointer text-lg font-semibold ${checked ? "text-teal-ink" : ""}`}>
            {label}
          </label>{" "}
          {verified && checked && <VerifiedBadge />}
          {checked && !verified && <span className="ml-1 text-sm text-muted">(done, waiting on CTR to verify)</span>}
          {(description || note) && (
            <p id={`${id}-desc`} className="mt-1 text-base text-muted">
              {description}
              {note && <em className="ml-1 font-semibold text-ink not-italic">{note}</em>}
            </p>
          )}
          {disabled && disabledReason && <p className="mt-1 text-sm text-muted">{disabledReason}</p>}
          {error && (
            <p role="alert" className="mt-1 text-sm font-semibold text-coral-ink">
              That didn&apos;t save. Please try again.
            </p>
          )}
        </div>
      </div>
      {children && <div className="shrink-0 pl-10 sm:pl-0">{children}</div>}
    </li>
  );
}
