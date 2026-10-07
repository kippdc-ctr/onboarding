"use client";

import { useModuleProgress } from "./ProgressContext";

export function StickyProgress({ title, completed }: { title: string; completed: boolean }) {
  const { reqs } = useModuleProgress();
  const done = reqs.filter((r) => r.done).length;
  const pct = reqs.length ? Math.round((100 * done) / reqs.length) : 100;
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-gray-brand/30 bg-white/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-semibold">{title}</span>
        <span className="shrink-0 font-semibold text-teal-ink" aria-live="polite">
          {completed ? "Complete ✓" : `${done} of ${reqs.length} required steps`}
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-brand/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Module progress">
        <div className="h-full rounded-full bg-teal-light transition-all" style={{ width: `${completed ? 100 : pct}%` }} />
      </div>
    </div>
  );
}
