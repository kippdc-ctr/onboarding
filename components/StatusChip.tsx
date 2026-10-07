import { Status, STATUS_LABEL } from "@/lib/progress";

const STYLES: Record<Status, string> = {
  not_started: "bg-white text-muted border-gray-brand",
  in_progress: "bg-yellow-wash text-ink border-yellow",
  complete: "bg-teal-wash text-teal-ink border-teal",
  overdue: "bg-coral text-white border-coral",
};

const ICON: Record<Status, string> = { not_started: "○", in_progress: "◐", complete: "✓", overdue: "!" };

export function StatusChip({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-0.5 text-sm font-bold whitespace-nowrap ${STYLES[status]} ${className}`}>
      <span aria-hidden="true">{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
