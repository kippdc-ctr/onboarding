import { requireUser } from "@/lib/auth";
import { getGoals, getPeriods, getSources, getYear } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import type { ImportKind } from "@/lib/mapping";
import { GoalOption, ImportWizard } from "./ImportWizard";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("owner", "team");
  const sp = await searchParams;
  const year = await getYear();
  const [goals, periods, sources] = await Promise.all([getGoals(year.id), getPeriods(year.id), getSources()]);
  const options: GoalOption[] = goals
    .filter((g) => g.number !== 0)
    .map((g) => {
      const reason =
        g.type === "perception"
          ? "survey: use aggregate"
          : g.derive_rule
            ? `calculated from goal ${g.derive_rule.from}`
            : !["first_year", "senior_residents"].includes(g.population)
              ? "not on the roster: use aggregate"
              : null;
      return { id: g.id, number: g.number, text: g.text, resultsOk: !reason, reason, measured_at: g.measured_at, source: g.source };
    });
  const kind: ImportKind = sp.kind === "results" || sp.kind === "aggregate" ? sp.kind : "roster";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Import</h1>
        <p className="text-muted">
          Into {year.id}. Every import shows a preview first, lists rows it can&apos;t match, and never drops a row silently. Re-importing the same goal and period replaces what was
          saved before.
        </p>
      </div>
      {year.locked ? (
        <p className="card font-semibold text-coral-ink">{year.id} is locked. Unlock it in Admin → School years to import.</p>
      ) : (
        <ImportWizard
          year={year.id}
          goals={options}
          periods={periods.map((p) => p.key)}
          sources={sources.map((s) => ({ key: s.key, label: s.label }))}
          today={todayISO()}
          initialKind={kind}
          initialGoal={sp.goal ? Number(sp.goal) : null}
        />
      )}
    </div>
  );
}
