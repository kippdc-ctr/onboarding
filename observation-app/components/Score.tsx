import { SCORE_LABELS } from "@/lib/rules";
import { cls, scoreClass } from "@/lib/ui";

/** A score as a colored pill. The number is always visible; early/practice scores get a dashed ring and an "e". */
export function ScorePill({ score, early, size = "md" }: { score: number | null | undefined; early?: boolean; size?: "sm" | "md" }) {
  if (score === null || score === undefined) return <span className="text-muted" aria-label="no score">–</span>;
  const label = `${score}: ${SCORE_LABELS[score] ?? ""}${early ? " (early / practice, not counted)" : ""}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cls("pill", size === "sm" && "h-6 min-w-6 text-xs", scoreClass(score), early && "outline-2 outline-dashed outline-offset-1 outline-gray-brand")}
    >
      {score}
      {early && <span className="ml-0.5 text-[0.65rem] font-semibold">e</span>}
    </span>
  );
}

/** CFS dots: filled = demonstrated, ring = not yet seen. */
export function CfsDots({ items, demonstrated }: { items: { id: string; short_label: string; full_text: string }[]; demonstrated: string[] | null }) {
  if (!demonstrated) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label={`${demonstrated.length} of ${items.length} look-fors demonstrated`}>
      {items.map((c) => {
        const on = demonstrated.includes(c.id);
        return (
          <span
            key={c.id}
            title={`${on ? "Demonstrated" : "Not yet seen"}: ${c.full_text}`}
            className={cls("inline-block h-3 w-3 rounded-full border-2", on ? "border-teal-ink bg-teal-ink" : "border-gray-brand bg-white")}
          />
        );
      })}
    </span>
  );
}

export function Trend({ prev, cur }: { prev: number | null | undefined; cur: number | null | undefined }) {
  if (prev == null || cur == null) return null;
  if (cur > prev) return <span className="font-bold text-teal-ink" title={`Up from ${prev}`}>↑<span className="sr-only">up from {prev}</span></span>;
  if (cur < prev) return <span className="font-bold text-coral-ink" title={`Down from ${prev}`}>↓<span className="sr-only">down from {prev}</span></span>;
  return <span className="text-muted" title="No change">→<span className="sr-only">no change</span></span>;
}
