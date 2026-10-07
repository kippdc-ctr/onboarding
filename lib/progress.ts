// Pure status computations. No database access here, so the same logic drives the
// resident dashboard, the admin grid, and the CSV exports.
import { ModuleContent, moduleChecklistItems } from "./content";
import type { Config, PhaseItem, ProgressBundle, Resident } from "./data";
import { addDays, isPast } from "./dates";

export type Status = "not_started" | "in_progress" | "complete" | "overdue";

export const STATUS_LABEL: Record<Status, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  overdue: "Overdue",
};

function override(cfg: Config, group: number | null, target: string): string | null {
  if (!group) return null;
  return cfg.overrides.find((o) => o.group_number === group && o.target === target)?.due_date ?? null;
}

export function welcomeDate(cfg: Config, group: number | null): string | null {
  return cfg.groups.find((g) => g.number === group)?.welcome_email_date ?? null;
}

export function phaseItemDue(cfg: Config, item: PhaseItem, group: number | null): string | null {
  const o = override(cfg, group, `item:${item.id}`) ?? (item.phase === 1 ? override(cfg, group, "phase1") : null);
  if (o) return o;
  if (item.due_rule === "fixed") return item.due_date;
  const w = welcomeDate(cfg, group);
  return w ? addDays(w, item.due_days ?? 14) : null;
}

export function moduleDue(cfg: Config, slug: string, group: number | null): string | null {
  return override(cfg, group, `module:${slug}`) ?? cfg.modules.find((m) => m.slug === slug)?.due_date ?? null;
}

export function phase1Due(cfg: Config, group: number | null): string | null {
  const first = cfg.phaseItems.find((i) => i.phase === 1);
  return first ? phaseItemDue(cfg, first, group) : null;
}

// ---------- Modules ----------

export type ModuleState = {
  slug: string;
  content: ModuleContent;
  due: string | null;
  status: Status;
  totalQuestions: number;
  answered: Set<string>;
  bestScore: number | null; // correct answers in the best attempt
  attemptCount: number; // number of quiz attempts (rounds)
  currentAttempt: number;
  ruleMet: boolean;
  completedAt: Date | null;
  missing: string[]; // human-readable list of what's left
  checklist: Record<string, { checked: boolean; verified: boolean }>;
};

export function moduleState(cfg: Config, resident: Pick<Resident, "group_number">, b: ProgressBundle, m: ModuleContent): ModuleState {
  const qs = m.quiz?.questions ?? [];
  const attempts = b.attempts.filter((a) => a.module_slug === m.slug);
  const answered = new Set(attempts.map((a) => a.question_id).filter((id) => qs.some((q) => q.id === id)));
  const byAttempt = new Map<number, number>();
  for (const a of attempts) byAttempt.set(a.attempt_no, (byAttempt.get(a.attempt_no) ?? 0) + (a.is_correct ? 1 : 0));
  const attemptCount = byAttempt.size;
  const bestScore = attemptCount ? Math.max(...byAttempt.values()) : null;
  const currentAttempt = attemptCount ? Math.max(...byAttempt.keys()) : 1;

  const checklist: ModuleState["checklist"] = {};
  for (const c of b.checklist.filter((c) => c.module_slug === m.slug)) checklist[c.item_id] = { checked: c.checked, verified: c.verified };

  const missing: string[] = [];
  if (m.completion.allQuestions && qs.length && answered.size < qs.length)
    missing.push(`Answer all knowledge checks (${answered.size}/${qs.length})`);
  const savedReflections = new Set(b.reflections.filter((r) => r.module_slug === m.slug && r.response_text.trim()).map((r) => r.prompt_id));
  const reflLeft = m.completion.reflections.filter((id) => !savedReflections.has(id)).length;
  if (reflLeft) missing.push(`Save ${reflLeft} reflection${reflLeft > 1 ? "s" : ""}`);
  const items = moduleChecklistItems(m);
  for (const id of m.completion.checklist)
    if (!checklist[id]?.checked) missing.push(`Tick "${items.find((i) => i.id === id)?.label ?? id}"`);
  const doneActivities = new Set(b.activities.filter((a) => a.module_slug === m.slug && a.completed_at).map((a) => a.activity_id));
  const actLeft = m.completion.activities.filter((id) => !doneActivities.has(id)).length;
  if (actLeft) missing.push(`Finish ${actLeft} practice activit${actLeft > 1 ? "ies" : "y"}`);

  const prog = b.moduleProgress.find((p) => p.module_slug === m.slug);
  const completedAt = prog?.completed_at ?? null;
  const started =
    !!prog?.started_at ||
    attempts.length > 0 ||
    savedReflections.size > 0 ||
    Object.values(checklist).some((c) => c.checked) ||
    b.activities.some((a) => a.module_slug === m.slug);
  const due = moduleDue(cfg, m.slug, resident.group_number);
  let status: Status = completedAt ? "complete" : started ? "in_progress" : "not_started";
  if (status !== "complete" && isPast(due, cfg.today)) status = "overdue";

  return {
    slug: m.slug,
    content: m,
    due,
    status,
    totalQuestions: qs.length,
    answered,
    bestScore,
    attemptCount,
    currentAttempt,
    ruleMet: missing.length === 0,
    completedAt,
    missing,
    checklist,
  };
}

export function accuracyText(s: Pick<ModuleState, "bestScore" | "totalQuestions">): string {
  if (!s.totalQuestions) return "";
  if (s.bestScore === null) return "—";
  return `${s.bestScore}/${s.totalQuestions}`;
}

export function accuracyPercent(s: Pick<ModuleState, "bestScore" | "totalQuestions">): string {
  if (!s.totalQuestions || s.bestScore === null) return "";
  return `${Math.round((100 * s.bestScore) / s.totalQuestions)}%`;
}

// ---------- Phase items ----------

export type ItemState = {
  item: PhaseItem;
  due: string | null;
  visible: boolean;
  required: boolean;
  note: string | null;
  checked: boolean;
  verified: boolean;
};

export function itemStates(cfg: Config, r: Pick<Resident, "group_number" | "praxis_exempt">, b: ProgressBundle, phase: 1 | 3): ItemState[] {
  return cfg.phaseItems
    .filter((i) => i.phase === phase)
    .map((item) => {
      const c = b.itemChecks.find((x) => x.item_id === item.id);
      let visible = true;
      let required = item.required;
      let note: string | null = null;
      if (item.condition === "praxis_not_exempt") {
        if (r.praxis_exempt === true) visible = false;
        else if (r.praxis_exempt == null) {
          required = false;
          note = "Only if you are not exempt.";
        }
      }
      return { item, due: phaseItemDue(cfg, item, r.group_number), visible, required, note, checked: !!c?.checked, verified: !!c?.verified };
    });
}

function rollup(today: string, parts: { done: boolean; required: boolean; touched: boolean }[], due: string | null): Status {
  const req = parts.filter((p) => p.required);
  const complete = req.length > 0 ? req.every((p) => p.done) : parts.every((p) => p.done);
  if (complete) return "complete";
  if (isPast(due, today)) return "overdue";
  return parts.some((p) => p.touched) ? "in_progress" : "not_started";
}

export type PhaseSummary = { phase: 1 | 2 | 3; status: Status; dues: string[] };

export type ResidentSummary = {
  phase1: ItemState[];
  phase3: ItemState[];
  modules: ModuleState[];
  phases: PhaseSummary[];
  modulesComplete: number;
  prework: number; // percent of modules complete
  itemsComplete: number; // count of required things done, for sorting
  anyOverdue: boolean;
  nothingStarted: boolean;
};

export function summarize(cfg: Config, r: Resident, b: ProgressBundle): ResidentSummary {
  const enabled = new Set(cfg.modules.filter((m) => m.enabled).map((m) => m.slug));
  const modules = cfg.content.filter((m) => enabled.has(m.slug)).map((m) => moduleState(cfg, r, b, m));
  const phase1 = itemStates(cfg, r, b, 1);
  const phase3 = itemStates(cfg, r, b, 3);

  const p1Visible = phase1.filter((i) => i.visible);
  const p1Due = p1Visible.map((i) => i.due).filter(Boolean).sort().at(-1) ?? null;
  const p3Visible = phase3.filter((i) => i.visible);
  const p3Due = p3Visible.map((i) => i.due).filter(Boolean).sort().at(-1) ?? null;

  const p1 = rollup(cfg.today, p1Visible.map((i) => ({ done: i.checked, required: i.required, touched: i.checked })), p1Due);
  const p3 = rollup(cfg.today, p3Visible.map((i) => ({ done: i.checked, required: i.required, touched: i.checked })), p3Due);
  let p2: Status;
  if (modules.length && modules.every((m) => m.status === "complete")) p2 = "complete";
  else if (modules.some((m) => m.status === "overdue")) p2 = "overdue";
  else if (modules.some((m) => m.status !== "not_started")) p2 = "in_progress";
  else p2 = "not_started";

  const p2Dues = [...new Set(modules.map((m) => m.due).filter((d): d is string => !!d))].sort();
  const phases: PhaseSummary[] = [
    { phase: 1, status: p1, dues: p1Due ? [p1Due] : [] },
    { phase: 2, status: p2, dues: p2Dues },
    { phase: 3, status: p3, dues: [...new Set(p3Visible.map((i) => i.due).filter((d): d is string => !!d))].sort() },
  ];
  const modulesComplete = modules.filter((m) => m.status === "complete").length;
  return {
    phase1,
    phase3,
    modules,
    phases,
    modulesComplete,
    prework: modules.length ? Math.round((100 * modulesComplete) / modules.length) : 0,
    itemsComplete: modulesComplete + p1Visible.filter((i) => i.checked).length + p3Visible.filter((i) => i.checked).length,
    anyOverdue: phases.some((p) => p.status === "overdue"),
    nothingStarted: phases.every((p) => p.status === "not_started"),
  };
}

export const PHASE_TITLES: Record<1 | 2 | 3, string> = {
  1: "Welcome and action items",
  2: "Foundational prework",
  3: "HR and summer PD prep",
};
