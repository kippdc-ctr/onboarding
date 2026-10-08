import { Change, GoalStatus, STATUS_LABEL } from "@/lib/status";
import { GoalType, TYPE_LABEL } from "@/lib/data";

const STATUS_STYLE: Record<GoalStatus, string> = {
  met: "bg-teal-dark text-white border-teal-dark",
  close: "bg-gold-light text-ink border-yellow",
  off_track: "bg-coral text-white border-coral",
  not_yet: "bg-white text-muted border-gray-brand/60",
  no_data: "bg-white text-coral-ink border-coral border-dashed",
};
const STATUS_ICON: Record<GoalStatus, string> = { met: "✓", close: "◐", off_track: "!", not_yet: "○", no_data: "?" };

export function StatusChip({ status, label }: { status: GoalStatus; label?: string }) {
  return (
    <span className={`chip ${STATUS_STYLE[status]}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

const TYPE_STYLE: Record<GoalType, string> = {
  achievement: "border-teal/60 text-teal-ink",
  perception: "border-yellow text-ink",
  input: "border-gray-brand/60 text-muted",
};

export function TypeChip({ type }: { type: GoalType }) {
  return <span className={`inline-block rounded-md border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TYPE_STYLE[type]}`}>{TYPE_LABEL[type]}</span>;
}

const CHANGE: Record<Change, { icon: string; label: string; cls: string }> = {
  up: { icon: "▲", label: "Up", cls: "text-teal-ink" },
  down: { icon: "▼", label: "Down", cls: "text-coral-ink" },
  same: { icon: "▬", label: "No change", cls: "text-muted" },
  new: { icon: "★", label: "NEW", cls: "text-muted" },
};

/** Direction vs the SY25-26 actual. For "at most" goals (fewer is better) up is shown in coral. */
export function ChangeArrow({ change, fewerIsBetter = false }: { change: Change; fewerIsBetter?: boolean }) {
  const c = CHANGE[change];
  const cls = fewerIsBetter && change === "up" ? "text-coral-ink" : fewerIsBetter && change === "down" ? "text-teal-ink" : c.cls;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap ${cls}`}>
      <span aria-hidden="true">{c.icon}</span>
      {c.label}
    </span>
  );
}

export function SmallGroupBadge() {
  return (
    <span className="ml-1 rounded border border-coral px-1 text-xs font-bold text-coral-ink" title="Fewer than 5 people. Owner view only: don't screenshot or share.">
      small group
    </span>
  );
}
