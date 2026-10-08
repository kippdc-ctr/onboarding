import { formatValue, valueOf } from "@/lib/status";
import { SmallGroupBadge } from "./Chips";

/** A value with its n, always (spec principle 3), or "n < 5" when suppressed for this viewer. */
export function Value({
  unit,
  numerator,
  denominator,
  suppressed = false,
  smallGroup = false,
  big = false,
}: {
  unit: "percent" | "count";
  numerator: number;
  denominator: number | null;
  suppressed?: boolean;
  smallGroup?: boolean;
  big?: boolean;
}) {
  if (suppressed) return <span className="font-semibold text-muted" title="Groups under 5 people are hidden to protect privacy">n &lt; 5</span>;
  const v = valueOf(unit, { numerator, denominator });
  const n = denominator === null ? null : `${fmt(numerator)} / ${fmt(denominator)}`;
  return (
    <span className="whitespace-nowrap">
      <span className={big ? "text-3xl font-bold text-ink" : "font-bold"}>{unit === "count" && denominator !== null ? `${fmt(numerator)} of ${fmt(denominator)}` : formatValue(unit, v)}</span>
      {unit === "percent" && n && <span className="ml-1 text-sm text-muted">({n})</span>}
      {smallGroup && <SmallGroupBadge />}
    </span>
  );
}

function fmt(x: number): string {
  return String(Math.round(Number(x) * 100) / 100);
}
